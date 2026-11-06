import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../../lib/args";
import { OpenMailHttpClient } from "../../lib/http";
import { runDraftsCommand } from "../drafts";

const version = "2026-11-06T10:00:00.123Z";
const client = new OpenMailHttpClient({ baseUrl: "https://example.invalid", apiKey: "om_test" });
function run(args: string[]) {
  const argv = ["drafts", ...args];
  vi.spyOn(process, "argv", "get").mockReturnValue(["node", "openmail", ...argv]);
  return runDraftsCommand(client, parseArgs(argv), "default-inbox");
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("draft commands", () => {
  it("saves incomplete drafts and preserves To/Cc/Bcc, plain text and HTML without sending", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "draft-1" })));
    vi.stubGlobal("fetch", fetch);
    await run(["create", "--to", "a@example.com", "--cc", "b@example.com", "--cc=c@example.com", "--bcc", "d@example.com", "--body", " Plain ", "--body-html", "<p>HTML</p>"]);
    expect(fetch.mock.calls[0][0]).toBe("https://example.invalid/v1/inboxes/default-inbox/drafts");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ to: "a@example.com", cc: ["b@example.com", "c@example.com"], bcc: ["d@example.com"], body: " Plain ", bodyHtml: "<p>HTML</p>" });
    fetch.mockResolvedValue(new Response("{}"));
    await run(["create"]);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({});
  });

  it("encodes inbox ids and query parameters and retains the list total", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"data":[],"total":3}'));
    vi.stubGlobal("fetch", fetch);
    expect(await run(["list", "--inbox-id", "i/a", "--query", "a & b", "--limit", "2", "--offset", "1"])).toEqual({ data: [], total: 3 });
    const url = new URL(fetch.mock.calls[0][0]);
    expect(url.pathname).toBe("/v1/inboxes/i%2Fa/drafts");
    expect(Object.fromEntries(url.searchParams)).toEqual({ q: "a & b", limit: "2", offset: "1" });
  });

  it("reads the version and sends only the stored reviewed draft", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ id: "d/a", updatedAt: version })))
      .mockResolvedValueOnce(new Response('{"messageId":"m","threadId":"t","status":"sent"}'));
    vi.stubGlobal("fetch", fetch);
    expect(await run(["get", "--draft-id", "d/a"])).toMatchObject({ updatedAt: version });
    await run(["send", "--draft-id", "d/a", "--updated-at", version]);
    expect(fetch.mock.calls[1][0]).toBe("https://example.invalid/v1/inboxes/default-inbox/drafts/d%2Fa/send");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ updatedAt: version });
  });

  it.each([403, 409, 502])("surfaces %s without retrying or replacing the reviewed version", async (status) => {
    const fetch = vi.fn().mockResolvedValue(new Response('{"error":"draft_changed","message":"Review draft"}', { status }));
    vi.stubGlobal("fetch", fetch);
    await expect(run(["send", "--draft-id", "d", "--updated-at", version])).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["send", "--draft-id", "d"], ["send", "--draft-id", "d", "--updated-at", "invalid"],
    ["send", "--draft-id", "d", "--updated-at", version, "--to", "changed@example.com"],
    ["create", "--attach", "file.txt"], ["create", "--to", "a@example.com", "--to", "b@example.com"],
    ["list", "--limit", "101"], ["list", "--offset", "-1"], ["list", "--limit", "2x"], ["get"],
  ])("rejects invalid arguments before making requests: %j", async (...args) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(run(args)).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});
