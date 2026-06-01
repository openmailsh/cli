import { describe, expect, it, vi } from "vitest";
import { parseArgs } from "../../lib/args";
import { runUsageCommand } from "../usage";
import type { OpenMailHttpClient } from "../../lib/http";

function makeClient() {
  return {
    get: vi.fn().mockResolvedValue({ groupBy: "inbox", inboxes: [], totals: {} }),
  } as unknown as OpenMailHttpClient & { get: ReturnType<typeof vi.fn> };
}

describe("runUsageCommand", () => {
  it("passes from/to/group-by as query params", async () => {
    const client = makeClient();
    const parsed = parseArgs([
      "usage",
      "--from",
      "2026-05-01T00:00:00Z",
      "--to",
      "2026-06-01T00:00:00Z",
      "--group-by",
      "account",
    ]);

    await runUsageCommand(client, parsed);

    expect(client.get).toHaveBeenCalledWith("/v1/usage", {
      from: "2026-05-01T00:00:00Z",
      to: "2026-06-01T00:00:00Z",
      group_by: "account",
    });
  });

  it("sends no query params when no flags are given", async () => {
    const client = makeClient();
    const parsed = parseArgs(["usage"]);

    await runUsageCommand(client, parsed);

    expect(client.get).toHaveBeenCalledWith("/v1/usage", {});
  });
});
