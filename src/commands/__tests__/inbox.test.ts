import { describe, expect, it } from "vitest";
import { parseArgs } from "../../lib/args";
import type { OpenMailHttpClient } from "../../lib/http";
import { runInboxCommand } from "../inbox";

type Call = { method: string; path: string; body?: unknown };

function fakeClient(handlers: {
  post?: (path: string, body: unknown) => unknown;
  get?: (path: string) => unknown;
  delete?: (path: string) => unknown;
}) {
  const calls: Call[] = [];
  const client = {
    async post(path: string, body?: unknown) {
      calls.push({ method: "POST", path, body });
      return handlers.post ? handlers.post(path, body) : {};
    },
    async get(path: string) {
      calls.push({ method: "GET", path });
      return handlers.get ? handlers.get(path) : {};
    },
    async delete(path: string) {
      calls.push({ method: "DELETE", path });
      return handlers.delete ? handlers.delete(path) : { ok: true };
    },
  } as unknown as OpenMailHttpClient;
  return { client, calls };
}

describe("inbox create --with-key", () => {
  it("creates the inbox, then mints an inbox-scoped key for it", async () => {
    const inbox = { id: "inb_1", address: "a@openmail.sh", podId: "pod_1" };
    const apiKey = { id: "key_1", inboxId: "inb_1", token: "om_secret" };
    const { client, calls } = fakeClient({
      post: (path) => (path === "/v1/inboxes" ? inbox : apiKey),
    });

    const result = await runInboxCommand(
      client,
      parseArgs(["inbox", "create", "--with-key", "--display-name", "Child", "--key-name", "child-1"]),
    );

    expect(result).toEqual({ inbox, apiKey });
    expect(calls).toEqual([
      { method: "POST", path: "/v1/inboxes", body: { displayName: "Child" } },
      { method: "POST", path: "/v1/inboxes/inb_1/api-keys", body: { name: "child-1" } },
    ]);
  });

  it("deletes the inbox and rethrows when minting fails", async () => {
    const { client, calls } = fakeClient({
      post: (path) => {
        if (path === "/v1/inboxes") return { id: "inb_1" };
        throw new Error("mint failed");
      },
    });

    await expect(runInboxCommand(client, parseArgs(["inbox", "create", "--with-key"]))).rejects.toThrow(
      "mint failed",
    );
    expect(calls.at(-1)).toEqual({ method: "DELETE", path: "/v1/inboxes/inb_1" });
  });
});

describe("inbox create", () => {
  it("forwards domain and webhook flags", async () => {
    const { client, calls } = fakeClient({});
    await runInboxCommand(
      client,
      parseArgs([
        "inbox",
        "create",
        "--mailbox-name",
        "bob",
        "--domain",
        "mail.example.com",
        "--webhook-url",
        "https://example.com/hook",
      ]),
    );
    expect(calls[0]).toEqual({
      method: "POST",
      path: "/v1/inboxes",
      body: {
        mailboxName: "bob",
        domain: "mail.example.com",
        webhookUrl: "https://example.com/hook",
      },
    });
  });
});

describe("inbox keys", () => {
  it("creates, lists and revokes keys under the inbox", async () => {
    const { client, calls } = fakeClient({});
    await runInboxCommand(
      client,
      parseArgs(["inbox", "keys", "create", "--id", "inb_1", "--name", "n"]),
    );
    await runInboxCommand(client, parseArgs(["inbox", "keys", "list", "--id", "inb_1"]));
    await runInboxCommand(
      client,
      parseArgs(["inbox", "keys", "revoke", "--id", "inb_1", "--key-id", "key_9"]),
    );
    expect(calls).toEqual([
      { method: "POST", path: "/v1/inboxes/inb_1/api-keys", body: { name: "n" } },
      { method: "GET", path: "/v1/inboxes/inb_1/api-keys" },
      { method: "DELETE", path: "/v1/inboxes/inb_1/api-keys/key_9" },
    ]);
  });

  it("requires --id and --key-id", async () => {
    const { client } = fakeClient({});
    await expect(
      runInboxCommand(client, parseArgs(["inbox", "keys", "list"])),
    ).rejects.toThrow("missing --id");
    await expect(
      runInboxCommand(client, parseArgs(["inbox", "keys", "revoke", "--id", "inb_1"])),
    ).rejects.toThrow("missing --key-id");
  });
});
