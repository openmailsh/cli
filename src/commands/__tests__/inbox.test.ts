import { describe, expect, it } from "vitest";
import { parseArgs } from "../../lib/args";
import type { OpenMailHttpClient } from "../../lib/http";
import { runInboxCommand } from "../inbox";

type Call = { method: string; path: string; body?: unknown; query?: unknown };

function fakeClient() {
  const calls: Call[] = [];
  const client = {
    async post(path: string, body?: unknown) {
      calls.push({ method: "POST", path, body });
      return {};
    },
    async get(path: string, query?: unknown) {
      calls.push({ method: "GET", path, query });
      return {};
    },
    async delete(path: string) {
      calls.push({ method: "DELETE", path });
      return { ok: true };
    },
    async patch(path: string, body?: unknown) {
      calls.push({ method: "PATCH", path, body });
      return {};
    },
  } as unknown as OpenMailHttpClient;
  return { client, calls };
}

describe("inbox create", () => {
  it("forwards only the flags that were given", async () => {
    const { client, calls } = fakeClient();
    await runInboxCommand(
      client,
      parseArgs([
        "inbox",
        "create",
        "--mailbox-name",
        "bob",
        "--domain",
        "mail.example.com",
        "--pod-id",
        "pod_1",
      ]),
    );
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/v1/inboxes",
      body: { mailboxName: "bob", domain: "mail.example.com", podId: "pod_1" },
    });
  });

  it("sends an empty body when no flags are given", async () => {
    const { client, calls } = fakeClient();
    await runInboxCommand(client, parseArgs(["inbox", "create"]));
    expect(calls[0]).toEqual({ method: "POST", path: "/v1/inboxes", body: {} });
  });
});

describe("inbox list", () => {
  it("passes --pod-id through as a query filter", async () => {
    const { client, calls } = fakeClient();
    await runInboxCommand(client, parseArgs(["inbox", "list", "--pod-id", "pod_1", "--limit", "5"]));
    expect(calls[0]).toEqual({
      method: "GET",
      path: "/v1/inboxes",
      query: { limit: 5, offset: undefined, podId: "pod_1" },
    });
  });
});

describe("inbox get/delete", () => {
  it("uses --inbox-id", async () => {
    const { client, calls } = fakeClient();
    await runInboxCommand(client, parseArgs(["inbox", "get", "--inbox-id", "inb_1"]));
    await runInboxCommand(client, parseArgs(["inbox", "delete", "--inbox-id", "inb_1"]));
    expect(calls.map((c) => [c.method, c.path])).toEqual([
      ["GET", "/v1/inboxes/inb_1"],
      ["DELETE", "/v1/inboxes/inb_1"],
    ]);
  });

  it("still accepts the legacy --id alias", async () => {
    const { client, calls } = fakeClient();
    await runInboxCommand(client, parseArgs(["inbox", "get", "--id", "inb_1"]));
    expect(calls[0].path).toBe("/v1/inboxes/inb_1");
  });

  it("errors without an inbox id", async () => {
    const { client } = fakeClient();
    await expect(runInboxCommand(client, parseArgs(["inbox", "get"]))).rejects.toThrow(
      "missing --inbox-id",
    );
  });
});

describe("inbox update / webhook", () => {
  it("patches display name and webhook url, posts rotate/test", async () => {
    const { client, calls } = fakeClient();
    const run = (argv: string[]) => runInboxCommand(client, parseArgs(argv));
    await run(["inbox", "update", "--inbox-id", "inb_1", "--display-name", "Bot"]);
    await run(["inbox", "webhook", "set", "--inbox-id", "inb_1", "--url", "https://x.io/h"]);
    await run(["inbox", "webhook", "clear", "--inbox-id", "inb_1"]);
    await run(["inbox", "webhook", "rotate-secret", "--inbox-id", "inb_1"]);
    await run(["inbox", "webhook", "test", "--inbox-id", "inb_1"]);
    expect(calls).toEqual([
      { method: "PATCH", path: "/v1/inboxes/inb_1", body: { displayName: "Bot" } },
      { method: "PATCH", path: "/v1/inboxes/inb_1", body: { webhookUrl: "https://x.io/h" } },
      { method: "PATCH", path: "/v1/inboxes/inb_1", body: { webhookUrl: null } },
      { method: "POST", path: "/v1/inboxes/inb_1/webhook/rotate-secret", body: undefined },
      { method: "POST", path: "/v1/inboxes/inb_1/webhook/test", body: undefined },
    ]);
  });

  it("requires --url on webhook set", async () => {
    const { client } = fakeClient();
    await expect(
      runInboxCommand(client, parseArgs(["inbox", "webhook", "set", "--inbox-id", "inb_1"])),
    ).rejects.toThrow("missing --url");
  });
});

describe("inbox keys", () => {
  it("creates, lists and revokes keys under the inbox", async () => {
    const { client, calls } = fakeClient();
    await runInboxCommand(
      client,
      parseArgs(["inbox", "keys", "create", "--inbox-id", "inb_1", "--name", "n"]),
    );
    await runInboxCommand(client, parseArgs(["inbox", "keys", "list", "--inbox-id", "inb_1"]));
    await runInboxCommand(
      client,
      parseArgs(["inbox", "keys", "revoke", "--inbox-id", "inb_1", "--key-id", "key_9"]),
    );
    expect(calls).toEqual([
      { method: "POST", path: "/v1/inboxes/inb_1/api-keys", body: { name: "n" } },
      { method: "GET", path: "/v1/inboxes/inb_1/api-keys", query: undefined },
      { method: "DELETE", path: "/v1/inboxes/inb_1/api-keys/key_9" },
    ]);
  });

  it("requires --inbox-id and --key-id", async () => {
    const { client } = fakeClient();
    await expect(
      runInboxCommand(client, parseArgs(["inbox", "keys", "list"])),
    ).rejects.toThrow("missing --inbox-id");
    await expect(
      runInboxCommand(client, parseArgs(["inbox", "keys", "revoke", "--inbox-id", "inb_1"])),
    ).rejects.toThrow("missing --key-id");
  });
});
