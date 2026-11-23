import type { ParsedArgs } from "../lib/args";
import { getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

export async function runScheduledCommand(
  client: OpenMailHttpClient,
  parsed: ParsedArgs,
  inboxIdOverride?: string,
) {
  const action = parsed.command[1];
  const inboxId = getStringFlag(parsed.flags, "inbox-id") ?? inboxIdOverride;
  if (!inboxId) throw new Error("missing inbox id; run `openmail init` or pass --inbox-id");

  const base = `/v1/inboxes/${encodeURIComponent(inboxId)}/scheduled-sends`;

  if (action === "list") {
    return client.get(base, { status: getStringFlag(parsed.flags, "status") });
  }

  const sendId = getStringFlag(parsed.flags, "send-id");
  if (action === "reschedule") {
    const sendAt = getStringFlag(parsed.flags, "send-at");
    if (!sendId) throw new Error("missing --send-id");
    if (!sendAt) throw new Error("missing --send-at");
    return client.patch(`${base}/${encodeURIComponent(sendId)}`, { sendAt });
  }

  if (action === "cancel") {
    if (!sendId) throw new Error("missing --send-id");
    return client.delete(`${base}/${encodeURIComponent(sendId)}`);
  }

  throw new Error("missing scheduled action (list|reschedule|cancel)");
}
