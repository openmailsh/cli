import { resolveAttachment } from "../lib/attachments";
import type { ParsedArgs } from "../lib/args";
import {
  getBooleanFlag,
  getStringFlag,
  getRepeatedStringFlag,
  countFlagOccurrences,
} from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

export async function runSendCommand(
  client: OpenMailHttpClient,
  parsed: ParsedArgs,
  inboxIdOverride?: string,
) {
  const inboxId = getStringFlag(parsed.flags, "inbox-id") ?? inboxIdOverride;
  const to = getStringFlag(parsed.flags, "to");
  const cc = getRepeatedStringFlag("cc");
  const bcc = getRepeatedStringFlag("bcc");
  const subject = getStringFlag(parsed.flags, "subject");
  const body = getStringFlag(parsed.flags, "body");
  const bodyHtml = getStringFlag(parsed.flags, "body-html");
  const threadId = getStringFlag(parsed.flags, "thread-id");
  const noQuote = getBooleanFlag(parsed.flags, "no-quote");
  const idempotencyKey = getStringFlag(parsed.flags, "idempotency-key");
  const replyTo = getStringFlag(parsed.flags, "reply-to");
  const attachPaths = getRepeatedStringFlag("attach");

  if (!inboxId) throw new Error("missing inbox id; run `openmail init` or pass --inbox-id");
  if (countFlagOccurrences("to") > 1) {
    throw new Error(
      "--to may only be given once; it takes a single recipient. To reach more people, add --cc (repeatable), e.g. --to a@x.com --cc b@x.com --cc c@x.com",
    );
  }
  if (!to) throw new Error("missing --to");
  // The API derives "Re: <thread subject>" for in-thread replies, so only a
  // fresh thread needs a subject.
  if (!subject && !threadId) throw new Error("missing --subject (or pass --thread-id to reply)");
  if (!body) throw new Error("missing --body");

  const attachments = attachPaths.length ? await Promise.all(attachPaths.map(resolveAttachment)) : undefined;

  return client.sendEmail({
    inboxId,
    to,
    cc: cc.length > 0 ? cc : undefined,
    bcc: bcc.length > 0 ? bcc : undefined,
    subject,
    body,
    bodyHtml,
    threadId,
    includeQuote: noQuote ? false : undefined,
    idempotencyKey,
    replyTo,
    attachments,
  });
}
