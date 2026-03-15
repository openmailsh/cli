import type { ParsedArgs } from "../lib/args";
import { getNumberFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

export async function runMessagesCommand(
  client: OpenMailHttpClient,
  parsed: ParsedArgs,
  inboxIdOverride?: string,
) {
  const action = parsed.command[1];
  if (action !== "list") {
    throw new Error("messages command supports only: list");
  }

  const inboxId = getStringFlag(parsed.flags, "inbox-id") ?? inboxIdOverride;
  const direction = getStringFlag(parsed.flags, "direction");
  const limit = getNumberFlag(parsed.flags, "limit");
  const offset = getNumberFlag(parsed.flags, "offset");

  if (!inboxId) throw new Error("missing inbox id; run `openmail init` or pass --inbox-id");

  return client.get(`/v1/inboxes/${encodeURIComponent(inboxId)}/messages`, {
    direction,
    limit,
    offset,
  });
}
