import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../../lib/args";
import { OpenMailHttpClient } from "../../lib/http";
import { runDraftsCommand } from "../drafts";

const version = "2026-11-06T10:00:00.123Z";
const client = new OpenMailHttpClient({ baseUrl: "https://example.invalid", apiKey: "om_test" });
function run(args: string[]) {
  const argv = ["drafts", ...args];
  vi.spyOn(process, "argv", "get").mockReturnValue(["node", "openmail", ...argv]);
  return runDraftsCommand(client, parseArgs(argv));
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("draft commands", () => {
  it("edits only supplied fields with the exact version and never sends", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "d/1", updatedAt: "2026-11-18T10:00:00.000Z" })));
    vi.stubGlobal("fetch", fetch);
    const result = await run(["edit", "--draft-id", "d/1", "--updated-at", version, "--inbox-id", "in", "--subject", "Revised", "--cc", "a@example.com", "--cc", "b@example.com"]);
    expect(result).toMatchObject({ id: "d/1", updatedAt: "2026-11-18T10:00:00.000Z" });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("https://example.invalid/v1/drafts/d%2F1");
    expect(fetch.mock.calls[0][1].method).toBe("PATCH");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ updatedAt: version, inboxId: "in", subject: "Revised", cc: ["a@example.com", "b@example.com"] });
  });

  it.each([
    { args: ["--body", "Revised"], fields: { bodyText: "Revised", bodyHtml: null } },
    { args: ["--body", "Revised", "--body-html", "<p>Revised</p>"], fields: { bodyText: "Revised", bodyHtml: "<p>Revised</p>" } },
    { args: ["--body", "", "--subject", "", "--clear-to", "--clear-cc", "--clear-bcc"], fields: { bodyText: "", bodyHtml: null, subject: "", to: null, cc: [], bcc: [] } },
  ])("preserves explicit clears and replaces both body versions: $args", async ({ args, fields }) => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await run(["edit", "--draft-id", "d", "--updated-at", version, ...args]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ updatedAt: version, ...fields });
  });

  it("does not refresh or retry a conflicting edit", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "draft_changed" }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    await expect(run(["edit", "--draft-id", "d", "--updated-at", version, "--body", "Revised"]))
      .rejects.toMatchObject({ status: 409, message: expect.stringContaining("reconcile the requested changes") });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1].method).toBe("PATCH");
  });

  it.each([
    [], ["--body-html", "<p>Missing plain text</p>"], ["--body"], ["--cc"],
    ["--to", "a@example.com", "--clear-to"], ["--cc", "a@example.com", "--clear-cc"],
    ["--clear-bcc=false"], ["--thread-id", "different"], ["--body", "one", "--body", "two"],
  ])("rejects invalid edits before making requests: %j", async (...args) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(run(["edit", "--draft-id", "d", "--updated-at", version, ...args])).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("saves incomplete drafts and preserves To/Cc/Bcc, plain text and HTML without sending", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "draft-1" })));
    vi.stubGlobal("fetch", fetch);
    await run(["create", "--inbox-id", "inbox-1", "--to", "a@example.com", "--cc", "b@example.com", "--cc=c@example.com", "--bcc", "d@example.com", "--body", " Plain ", "--body-html", "<p>HTML</p>"]);
    expect(fetch.mock.calls[0][0]).toBe("https://example.invalid/v1/drafts");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ inboxId: "inbox-1", to: "a@example.com", cc: ["b@example.com", "c@example.com"], bcc: ["d@example.com"], body: " Plain ", bodyHtml: "<p>HTML</p>" });
    fetch.mockResolvedValue(new Response("{}"));
    await run(["create", "--inbox-id", "inbox-1"]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ inboxId: "inbox-1" });
  });

  it("encodes inbox ids and query parameters and retains the list total", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"data":[],"total":3}'));
    vi.stubGlobal("fetch", fetch);
    expect(await run(["list", "--inbox-id", "i/a", "--pod-id", "p/b", "--source-thread-id", "t/c", "--query", "a & b", "--limit", "2", "--offset", "1"])).toEqual({ data: [], total: 3 });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1/drafts");
    expect(Object.fromEntries(url.searchParams)).toEqual({ inboxId: "i/a", podId: "p/b", sourceThreadId: "t/c", q: "a & b", limit: "2", offset: "1" });
  });

  it("reads the version and sends only the stored reviewed draft", async () => {
    const draft = {
      id: "d/a", inboxId: "reply-inbox", updatedAt: version, threadId: "reply-thread",
      attachments: [{ filename: "report.pdf", contentType: "application/pdf", sizeBytes: 4, url: "https://example.invalid/draft-attachment" }],
    };
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify(draft)))
      .mockResolvedValueOnce(new Response('{"messageId":"m","threadId":"t","status":"sent"}'));
    vi.stubGlobal("fetch", fetch);
    expect(await run(["get", "--draft-id", "d/a"])).toEqual(draft);
    await run(["send", "--draft-id", "d/a", "--updated-at", version]);
    expect(fetch.mock.calls[1][0]).toBe("https://example.invalid/v1/drafts/d%2Fa/send");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ updatedAt: version });
  });

  it.each([403, 409, 502])("surfaces %s without retrying or replacing the reviewed version", async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"error":"draft_changed","message":"Review draft"}', { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(run(["send", "--draft-id", "d", "--updated-at", version])).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { status: 409, error: "draft_changed", message: "This draft changed. Refresh before continuing.", guidance: "obtain approval before sending" },
    { status: 502, error: "send_failed", message: "Sending failed. Your draft is saved. Refresh and try again.", guidance: "obtain approval to retry" },
    { status: 409, error: "draft_sending", message: "Sending is still being processed. Refresh and try again shortly.", guidance: "Wait and check the inbox" },
  ])("explains $error for agents without fetching or retrying", async ({ status, error, message, guidance }) => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error, message }), { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(run(["send", "--draft-id", "d", "--updated-at", version])).rejects.toMatchObject({
      status, message: expect.stringContaining(guidance),
      body: { error, message: expect.stringContaining(guidance) },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ updatedAt: version });
  });

  it("surfaces an owner mismatch without sending again", async () => {
    const body = { error: "draft_inbox_locked", message: "A draft must use its original sending inbox." };
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 }));
    vi.stubGlobal("fetch", fetch);
    await expect(run(["send", "--draft-id", "d", "--updated-at", version, "--inbox-id", "other"]))
      .rejects.toMatchObject({ status: 400, body });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves unrelated API errors", async () => {
    const body = { error: "recipient_not_permitted", message: "Recipient is blocked" };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 403 })));
    await expect(run(["send", "--draft-id", "d", "--updated-at", version])).rejects.toMatchObject({ status: 403, body });
  });

  it.each([
    ["send", "--draft-id", "d"], ["send", "--draft-id", "d", "--updated-at", "invalid"],
    ["send", "--draft-id", "d", "--updated-at", version, "--to", "changed@example.com"],
    ["create"], ["create", "--inbox-id"], ["create", "--inbox-id", "in", "--attach"],
    ["create", "--inbox-id", "in", "--inline-image", "invalid.png"],
    ["create", "--inbox-id", "in", "--to", "a@example.com", "--to", "b@example.com"],
    ["create", "--inbox-id", "in", "--thread-id", "reply", "--source-thread-id", "other"],
    ["list", "--thread-id", "t"], ["list", "--inboox-id", "i"],
    ["send", "--draft-id", "d", "--updated-at", version, "--pod-id", "p"],
    ["create", "--inbox-id", "i", "unexpected"],
    ["list", "--query"], ["list", "--pod-id"], ["send", "--draft-id", "d", "--updated-at", version, "--source-thread-id", "t"],
    ["list", "--limit", "101"], ["list", "--offset", "-1"], ["list", "--limit", "2x"], ["get"],
  ])("rejects invalid arguments before making requests: %j", async (...args) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(run(args)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("sends an optional owning-inbox assertion with the reviewed version", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await run(["send", "--draft-id", "d", "--updated-at", version, "--inbox-id", "i/a"]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ inboxId: "i/a", updatedAt: version });
  });

  it("keeps reply delivery separate from the source thread of a forward", async () => {
    const fetch = vi.fn().mockImplementation(async () => new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await run(["create", "--inbox-id", "in", "--thread-id", "reply"]);
    await run(["create", "--inbox-id", "in", "--source-thread-id", "origin", "--subject", "Forward"]);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ inboxId: "in", threadId: "reply" });
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ inboxId: "in", sourceThreadId: "origin", subject: "Forward" });
  });

  it("posts files, inline images and repeated recipients together as multipart", async () => {
    const dir = await mkdtemp(join(tmpdir(), "openmail-draft-"));
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    try {
      const cid = "inline-12345678-1234-1234-1234-123456789abc@openmail";
      const photo = join(dir, "photo.png");
      const notes = join(dir, "notes.txt");
      const html = `<img src="cid:${cid}">`;
      await writeFile(photo, Buffer.from([1, 2, 3]));
      await writeFile(notes, "Meeting notes");
      await run(["create", "--inbox-id", "in", "--source-thread-id", "origin", "--body-html", html,
        "--cc", "a@example.com", "--cc=b@example.com", "--attach", notes, "--inline-image", `${cid}=${photo}`]);
      const [url, request] = fetch.mock.calls[0];
      expect(url).toBe("https://example.invalid/v1/drafts");
      expect(request.headers["Content-Type"]).toBeUndefined();
      const form: FormData = request.body;
      expect(form.get("inboxId")).toBe("in");
      expect(form.get("sourceThreadId")).toBe("origin");
      expect(form.get("bodyHtml")).toBe(html);
      expect(form.getAll("cc")).toEqual(["a@example.com", "b@example.com"]);
      const file = form.get("attachments") as File;
      expect(file.name).toBe("notes.txt");
      expect(await file.text()).toBe("Meeting notes");
      const image = form.get("inlineImages") as File;
      expect(image.name).toBe(cid);
      expect(image.type).toBe("image/png");
      expect(new Uint8Array(await image.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lists drafts without consulting or requiring a default inbox", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"data":[],"total":0}'));
    vi.stubGlobal("fetch", fetch);
    await run(["list", "--json", "--verbose"]);
    expect(new URL(fetch.mock.calls[0][0]).pathname).toBe("/v1/drafts");
    expect(new URL(fetch.mock.calls[0][0]).searchParams.has("inboxId")).toBe(false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

});
