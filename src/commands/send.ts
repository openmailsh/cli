import type { ParsedArgs } from "../lib/args";
import { getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

export async function runSendCommand(
  client: OpenMailHttpClient,
  parsed: ParsedArgs,
  inboxIdOverride?: string,
) {
  const inboxId = getStringFlag(parsed.flags, "inbox-id") ?? inboxIdOverride;
  const to = getStringFlag(parsed.flags, "to");
  const subject = getStringFlag(parsed.flags, "subject");
  const body = getStringFlag(parsed.flags, "body");
  const bodyHtml = getStringFlag(parsed.flags, "body-html");
  const threadId = getStringFlag(parsed.flags, "thread-id");
  const idempotencyKey = getStringFlag(parsed.flags, "idempotency-key");

  if (!inboxId) throw new Error("missing inbox id; run `openmail init` or pass --inbox-id");
  if (!to) throw new Error("missing --to");
  if (!subject) throw new Error("missing --subject");
  if (!body) throw new Error("missing --body");

  return client.sendEmail({
    inboxId,
    to,
    subject,
    body,
    bodyHtml,
    threadId,
    idempotencyKey,
  });
}
