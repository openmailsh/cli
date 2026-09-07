import { describe, expect, it } from "vitest";
import { parseArgs } from "../../lib/args";
import type { OpenMailHttpClient } from "../../lib/http";
import { runPodCommand } from "../pod";
import { runDomainCommand } from "../domain";
import { runPolicyCommand } from "../policy";
import { runAttachmentsCommand } from "../attachments";

type Call = { method: string; path: string; body?: unknown; query?: unknown };

function fakeClient() {
  const calls: Call[] = [];
  const record = (method: string) => async (path: string, arg?: unknown) => {
    calls.push(
      method === "GET" ? { method, path, query: arg } : { method, path, body: arg },
    );
    return method === "DELETE" ? { ok: true } : {};
  };
  const client = {
    get: record("GET"),
    post: record("POST"),
    patch: record("PATCH"),
    put: record("PUT"),
    delete: record("DELETE"),
  } as unknown as OpenMailHttpClient;
  return { client, calls };
}

describe("pod", () => {
  it("maps CRUD and keys onto /v1/pods", async () => {
    const { client, calls } = fakeClient();
    const run = (argv: string[]) => runPodCommand(client, parseArgs(argv));
    await run(["pod", "create", "--name", "research", "--client-id", "r1"]);
    await run(["pod", "list", "--limit", "2"]);
    await run(["pod", "get", "--pod-id", "pod_1"]);
    await run(["pod", "update", "--pod-id", "pod_1", "--name", "r2"]);
    await run(["pod", "keys", "create", "--pod-id", "pod_1", "--name", "k"]);
    await run(["pod", "keys", "list", "--pod-id", "pod_1"]);
    await run(["pod", "keys", "revoke", "--pod-id", "pod_1", "--key-id", "key_1"]);
    await run(["pod", "delete", "--pod-id", "pod_1"]);
    expect(calls).toEqual([
      { method: "POST", path: "/v1/pods", body: { name: "research", clientId: "r1" } },
      { method: "GET", path: "/v1/pods", query: { limit: 2, offset: undefined } },
      { method: "GET", path: "/v1/pods/pod_1", query: undefined },
      { method: "PATCH", path: "/v1/pods/pod_1", body: { name: "r2" } },
      { method: "POST", path: "/v1/pods/pod_1/api-keys", body: { name: "k" } },
      { method: "GET", path: "/v1/pods/pod_1/api-keys", query: undefined },
      { method: "DELETE", path: "/v1/pods/pod_1/api-keys/key_1" },
      { method: "DELETE", path: "/v1/pods/pod_1" },
    ]);
  });

  it("requires --pod-id and rejects an empty update", async () => {
    const { client } = fakeClient();
    await expect(runPodCommand(client, parseArgs(["pod", "get"]))).rejects.toThrow(
      "missing --pod-id",
    );
    await expect(
      runPodCommand(client, parseArgs(["pod", "update", "--pod-id", "pod_1"])),
    ).rejects.toThrow("nothing to update");
  });
});

describe("domain", () => {
  it("maps onto /v1/domains", async () => {
    const { client, calls } = fakeClient();
    const run = (argv: string[]) => runDomainCommand(client, parseArgs(argv));
    await run(["domain", "add", "--domain", "mail.example.com", "--pod-id", "pod_1"]);
    await run(["domain", "verify", "--domain-id", "dom_1"]);
    await run(["domain", "delete", "--domain-id", "dom_1"]);
    expect(calls).toEqual([
      { method: "POST", path: "/v1/domains", body: { domain: "mail.example.com", podId: "pod_1" } },
      { method: "POST", path: "/v1/domains/dom_1/verify", body: undefined },
      { method: "DELETE", path: "/v1/domains/dom_1" },
    ]);
  });

  it("requires --domain on add", async () => {
    const { client } = fakeClient();
    await expect(runDomainCommand(client, parseArgs(["domain", "add"]))).rejects.toThrow(
      "missing --domain",
    );
  });
});

describe("policy", () => {
  it("scopes reads and writes with --inbox-id / --pod-id", async () => {
    const { client, calls } = fakeClient();
    const run = (argv: string[]) => runPolicyCommand(client, parseArgs(argv));
    await run(["policy", "get", "--inbox-id", "inb_1"]);
    await run(["policy", "mode", "--pod-id", "pod_1", "--direction", "inbound", "--mode", "allowlist"]);
    await run(["policy", "allow", "--inbox-id", "inb_1", "--direction", "inbound", "--value", "a@b.co"]);
    await run(["policy", "block", "--direction", "outbound", "--value", "*.x.com"]);
    await run(["policy", "rules", "remove", "--rule-id", "rule_1", "--pod-id", "pod_1"]);
    expect(calls).toEqual([
      { method: "GET", path: "/v1/policy", query: { podId: undefined, inboxId: "inb_1" } },
      {
        method: "PUT",
        path: "/v1/policy/mode?podId=pod_1",
        body: { mode: "allowlist", direction: "inbound" },
      },
      {
        method: "POST",
        path: "/v1/policy/rules?inboxId=inb_1",
        body: { type: "allow", value: "a@b.co", direction: "inbound" },
      },
      {
        method: "POST",
        path: "/v1/policy/rules",
        body: { type: "block", value: "*.x.com", direction: "outbound" },
      },
      { method: "DELETE", path: "/v1/policy/rules/rule_1?podId=pod_1" },
    ]);
  });

  it("validates enums and rejects both scopes at once", async () => {
    const { client } = fakeClient();
    const run = (argv: string[]) => runPolicyCommand(client, parseArgs(argv));
    await expect(run(["policy", "mode", "--direction", "sideways", "--mode", "none"])).rejects.toThrow(
      "--direction must be one of",
    );
    await expect(run(["policy", "mode", "--direction", "inbound", "--mode", "maybe"])).rejects.toThrow(
      "--mode must be one of",
    );
    await expect(run(["policy", "get", "--pod-id", "p", "--inbox-id", "i"])).rejects.toThrow(
      "not both",
    );
  });
});

describe("attachments", () => {
  it("text hits the /text endpoint with encoded segments", async () => {
    const { client, calls } = fakeClient();
    await runAttachmentsCommand(
      client,
      parseArgs(["attachments", "text", "--message-id", "msg_1", "--filename", "my report.pdf"]),
    );
    expect(calls[0].path).toBe("/v1/attachments/msg_1/my%20report.pdf/text");
  });

  it("requires --message-id and --filename", async () => {
    const { client } = fakeClient();
    await expect(
      runAttachmentsCommand(client, parseArgs(["attachments", "text", "--filename", "a.pdf"])),
    ).rejects.toThrow("missing --message-id");
    await expect(
      runAttachmentsCommand(client, parseArgs(["attachments", "text", "--message-id", "m"])),
    ).rejects.toThrow("missing --filename");
  });
});
