import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parseArgs } from "../../lib/args";
import { OpenMailHttpClient } from "../../lib/http";
import { runSendCommand } from "../send";

const client = new OpenMailHttpClient({ baseUrl: "https://example.invalid", apiKey: "om_test" });
const addresses = ["a@example.com", "b@example.com", "c@example.com"];
const recipientFlags = ["--to", "a@example.com, b@example.com", "--to=c@example.com",
  "--cc", "copy@example.com", "--bcc", "blind@example.com"];

function run(flags: string[]) {
  return runSendCommand(client, parseArgs(["send", "--body", "Hello", ...flags]), "inbox");
}

afterEach(() => vi.unstubAllGlobals());

describe("send recipients", () => {
  it.each([
    { flags: ["--subject", "Meeting"], fields: { subject: "Meeting" } },
    { flags: ["--thread-id", "thread"], fields: { threadId: "thread" } },
    { flags: ["--subject", "Meeting", "--send-at", "2026-12-01T10:00:00Z"],
      fields: { subject: "Meeting", sendAt: "2026-12-01T10:00:00Z" } },
  ])("preserves the full To list for $fields", async ({ flags, fields }) => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await run([...recipientFlags, ...flags]);
    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe("https://example.invalid/v1/inboxes/inbox/send");
    expect(JSON.parse(request.body)).toEqual({
      to: addresses, cc: ["copy@example.com"], bcc: ["blind@example.com"], body: "Hello", ...fields,
    });
  });

  it("uses the legacy scalar for one primary recipient", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await run(["--subject", "Meeting", "--to", addresses[0]]);
    expect(JSON.parse(fetch.mock.calls[0][1].body).to).toBe(addresses[0]);
  });

  it("includes every To recipient alongside attachments, Cc and Bcc", async () => {
    const fetch = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetch);
    await run([...recipientFlags, "--subject", "Notes", "--attach", join(__dirname, "../../../README.md")]);
    const form: FormData = fetch.mock.calls[0][1].body;
    expect(form.get("to")).toBe(JSON.stringify(addresses));
    expect(form.getAll("cc")).toEqual(["copy@example.com"]);
    expect(form.getAll("bcc")).toEqual(["blind@example.com"]);
    expect((form.get("attachments") as File).name).toBe("README.md");
  });

  it.each([
    [], ["--to"], ["--to", "--to", addresses[0]], ["--to", addresses[0], "--to="],
    ["--to", addresses[0] + ",, " + addresses[1]],
  ])("rejects missing To entries before sending: %j", async (...args) => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(run(["--subject", "Meeting", ...args])).rejects.toThrow("--to");
    expect(fetch).not.toHaveBeenCalled();
  });
});
