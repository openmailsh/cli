import { describe, expect, it, vi } from "vitest";
import { parseArgs } from "../../lib/args";
import { runInboxCommand } from "../inbox";
import type { OpenMailHttpClient } from "../../lib/http";

function makeClient() {
  return {
    post: vi.fn().mockResolvedValue({ id: "inb_1", address: "support@yourco.com" }),
    get: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    delete: vi.fn().mockResolvedValue({ ok: true }),
  } as unknown as OpenMailHttpClient & {
    post: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
}

describe("runInboxCommand create", () => {
  it("forwards --domain to POST /v1/inboxes", async () => {
    const client = makeClient();
    const parsed = parseArgs([
      "inbox",
      "create",
      "--mailbox-name",
      "support",
      "--display-name",
      "Support",
      "--domain",
      "agent-mail.example.com",
    ]);

    await runInboxCommand(client, parsed);

    expect(client.post).toHaveBeenCalledWith("/v1/inboxes", {
      mailboxName: "support",
      displayName: "Support",
      domain: "agent-mail.example.com",
    });
  });

  it("omits domain when the flag is not provided", async () => {
    const client = makeClient();
    const parsed = parseArgs(["inbox", "create", "--mailbox-name", "support"]);

    await runInboxCommand(client, parsed);

    expect(client.post).toHaveBeenCalledWith("/v1/inboxes", {
      mailboxName: "support",
    });
  });
});
