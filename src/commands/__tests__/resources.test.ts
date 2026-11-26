import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { parseArgs } from "../../lib/args";
import type { OpenMailHttpClient } from "../../lib/http";
import { printData } from "../../lib/output";
import { runPodCommand } from "../pod";
import { runDomainCommand } from "../domain";
import { runPolicyCommand } from "../policy";
import { runAttachmentsCommand } from "../attachments";
import { runThreadsCommand } from "../threads";
import { runMessagesCommand } from "../messages";
import { runFoldersCommand } from "../folders";
import { runScheduledCommand } from "../scheduled";

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
    await run(["domain", "update", "--domain-id", "dom_1", "--pod-id", "pod_2"]);
    await run(["domain", "update", "--domain-id", "dom_1", "--all-pods"]);
    await run(["domain", "delete", "--domain-id", "dom_1"]);
    expect(calls).toEqual([
      { method: "POST", path: "/v1/domains", body: { domain: "mail.example.com", podId: "pod_1" } },
      { method: "POST", path: "/v1/domains/dom_1/verify", body: undefined },
      { method: "PATCH", path: "/v1/domains/dom_1", body: { podId: "pod_2" } },
      { method: "PATCH", path: "/v1/domains/dom_1", body: { podId: null } },
      { method: "DELETE", path: "/v1/domains/dom_1" },
    ]);
  });

  it("refuses an update with nothing to change or with both scopes", async () => {
    const { client } = fakeClient();
    const run = (argv: string[]) => runDomainCommand(client, parseArgs(argv));
    await expect(run(["domain", "update", "--domain-id", "dom_1"])).rejects.toThrow(
      "nothing to update",
    );
    await expect(
      run(["domain", "update", "--domain-id", "dom_1", "--pod-id", "pod_2", "--all-pods"]),
    ).rejects.toThrow("not both");
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

describe("folders", () => {
  const run = (client: OpenMailHttpClient, ...args: string[]) => runFoldersCommand({
    client, parsed: parseArgs(["folders", ...args]), statePath: "", ctx: { output: "json", verbose: false },
  });

  it("lists standard and custom folders in the specified inbox", async () => {
    const { client } = fakeClient();
    const folders = { data: [{ id: 7, name: "INBOX", role: "inbox" }, { id: 8, name: "Jobs/Offers", role: null }] };
    client.get = vi.fn().mockResolvedValue(folders);
    expect(await run(client, "list", "--inbox-id", "a/b")).toEqual(folders);
    expect(client.get).toHaveBeenCalledWith("/v1/inboxes/a%2Fb/folders");
  });

  it("uses the default inbox and returns both item kinds and the page total", async () => {
    const { client } = fakeClient();
    const page = { total: 9, data: [{ id: "m1", kind: "message" }, { id: "d1", kind: "draft", subject: null }] };
    client.get = vi.fn().mockResolvedValue(page);
    vi.stubEnv("OPENMAIL_INBOX_ID", "default");
    try {
      expect(await run(client, "messages", "--folder-id", "42", "--limit", "2", "--offset", "3")).toEqual(page);
      expect(client.get).toHaveBeenCalledWith("/v1/inboxes/default/folders/42/messages", { limit: 2, offset: 3 });
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("uses API pagination defaults when flags are omitted", async () => {
    const { client, calls } = fakeClient();
    await run(client, "messages", "--folder-id", "1", "--inbox-id", "inb");
    expect(calls).toEqual([{ method: "GET", path: "/v1/inboxes/inb/folders/1/messages", query: { limit: undefined, offset: undefined } }]);
  });

  it.each([
    ["messages"], ["messages", "--folder-id"], ["messages", "--folder-id", "0"],
    ["messages", "--folder-id", "1a"], ["messages", "--folder-id", "2147483648"],
    ["messages", "--folder-id", "1", "--limit", "101"], ["messages", "--folder-id", "1", "--limit", "0"],
    ["messages", "--folder-id", "1", "--offset", "-1"], ["messages", "--folder-id", "1", "--offset", "2147483648"],
    ["list", "--inbox-id"], ["list", "--folder-id", "3"],
  ])("rejects invalid arguments before making a request (%s %s %s %s %s)", async (...args) => {
    const { client, calls } = fakeClient();
    await expect(run(client, ...args)).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

describe("attachments", () => {
  it("prints both attachment IDs in thread and inbox message listings", async () => {
    const { client } = fakeClient();
    const message = { id: "msg", attachments: [
      { id: "first", filename: "report.pdf" }, { id: "second", filename: "report.pdf" },
    ] };
    client.get = vi.fn().mockResolvedValue({ data: [message] });
    const results = [
      await runThreadsCommand(client, parseArgs(["threads", "get", "--thread-id", "thread"])),
      await runMessagesCommand(client, parseArgs(["messages", "list", "--inbox-id", "inbox"])),
    ];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      for (const result of results) {
        printData({ output: "json", verbose: false }, result);
        const [line] = stdout.mock.lastCall!;
        expect(JSON.parse(String(line)).data[0]).toEqual(message);
      }
    } finally {
      stdout.mockRestore();
    }
  });

  it("text hits the /text endpoint with encoded segments", async () => {
    const { client, calls } = fakeClient();
    await runAttachmentsCommand(
      client,
      parseArgs(["attachments", "text", "--message-id", "msg_1", "--filename", "my report.pdf"]),
    );
    expect(calls[0].path).toBe("/v1/attachments/msg_1/my%20report.pdf/text");
  });

  it("selects by ID and preserves a previously downloaded file with the same name", async () => {
    const { client, calls } = fakeClient();
    const name = `report-${randomUUID()}.pdf`;
    client.download = vi.fn(async (path: string) => ({
      bytes: Buffer.from(path.endsWith("/second") ? "second file" : "first file"),
      contentType: "application/pdf", filename: name,
    }));
    const args = (command: string, id: string, ...flags: string[]) =>
      parseArgs(["attachments", command, "--message-id", "msg", "--attachment-id", id, ...flags]);
    try {
      await runAttachmentsCommand(client, args("get", "first"));
      await expect(runAttachmentsCommand(client, args("get", "second"))).rejects.toMatchObject({ code: "EEXIST" });
      await runAttachmentsCommand(client, args("get", "second", "--out", name + ".copy"));
      expect(await readFile(name, "utf8")).toBe("first file");
      expect(await readFile(name + ".copy", "utf8")).toBe("second file");
      await runAttachmentsCommand(client, args("text", "second"));
      expect(calls[0].path).toBe("/v1/attachments/msg/second/text");
    } finally {
      await rm(name, { force: true });
      await rm(name + ".copy", { force: true });
    }
  });

  it("requires a message and an attachment selector", async () => {
    const { client } = fakeClient();
    await expect(
      runAttachmentsCommand(client, parseArgs(["attachments", "text", "--filename", "a.pdf"])),
    ).rejects.toThrow("missing --message-id");
    await expect(
      runAttachmentsCommand(client, parseArgs(["attachments", "text", "--message-id", "m"])),
    ).rejects.toThrow("missing --attachment-id");
  });
});

describe("scheduled", () => {
  it("maps list, reschedule, and cancel onto scheduled-sends", async () => {
    const { client, calls } = fakeClient();
    const run = (argv: string[]) =>
      runScheduledCommand(client, parseArgs(argv), "inb_1");
    await run(["scheduled", "list", "--status", "scheduled,failed"]);
    await run([
      "scheduled",
      "reschedule",
      "--send-id",
      "snd 1",
      "--send-at",
      "2026-11-24T06:00:00Z",
    ]);
    await run(["scheduled", "cancel", "--send-id", "snd 1"]);
    expect(calls).toEqual([
      {
        method: "GET",
        path: "/v1/inboxes/inb_1/scheduled-sends",
        query: { status: "scheduled,failed" },
      },
      {
        method: "PATCH",
        path: "/v1/inboxes/inb_1/scheduled-sends/snd%201",
        body: { sendAt: "2026-11-24T06:00:00Z" },
      },
      { method: "DELETE", path: "/v1/inboxes/inb_1/scheduled-sends/snd%201" },
    ]);
  });

  it("requires the inbox, the action, and the flags", async () => {
    const { client } = fakeClient();
    await expect(runScheduledCommand(client, parseArgs(["scheduled", "list"]))).rejects.toThrow(
      "missing inbox id",
    );
    await expect(
      runScheduledCommand(client, parseArgs(["scheduled"]), "inb_1"),
    ).rejects.toThrow("missing scheduled action");
    await expect(
      runScheduledCommand(client, parseArgs(["scheduled", "cancel"]), "inb_1"),
    ).rejects.toThrow("missing --send-id");
    await expect(
      runScheduledCommand(
        client,
        parseArgs(["scheduled", "reschedule", "--send-id", "snd_1"]),
        "inb_1",
      ),
    ).rejects.toThrow("missing --send-at");
  });
});

describe("threads and messages delete", () => {
  it("maps delete onto the thread and message endpoints", async () => {
    const { client, calls } = fakeClient();
    await runThreadsCommand(client, parseArgs(["threads", "delete", "--thread-id", "thr_1"]));
    await runMessagesCommand(client, parseArgs(["messages", "delete", "--message-id", "msg_1"]));
    expect(calls).toEqual([
      { method: "DELETE", path: "/v1/threads/thr_1" },
      { method: "DELETE", path: "/v1/messages/msg_1" },
    ]);
  });

  it("requires the id flags", async () => {
    const { client } = fakeClient();
    await expect(runThreadsCommand(client, parseArgs(["threads", "delete"]))).rejects.toThrow(
      "missing --thread-id",
    );
    await expect(
      runMessagesCommand(client, parseArgs(["messages", "delete"])),
    ).rejects.toThrow("missing --message-id");
  });
});
