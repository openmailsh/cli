import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";
import type { ParsedArgs } from "../lib/args";
import { getStringFlag, getRepeatedStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

const MIME_TYPES: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain",
  csv: "text/csv",
  html: "text/html",
  json: "application/json",
  xml: "application/xml",
  zip: "application/zip",
  gz: "application/gzip",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function getMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME_TYPES[ext] || "application/octet-stream";
}

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
  const attachPaths = getRepeatedStringFlag("attach");

  if (!inboxId) throw new Error("missing inbox id; run `openmail init` or pass --inbox-id");
  if (!to) throw new Error("missing --to");
  if (!subject) throw new Error("missing --subject");
  if (!body) throw new Error("missing --body");

  let attachments: { path: string; filename: string; contentType: string }[] | undefined;

  if (attachPaths.length > 0) {
    attachments = [];
    for (const raw of attachPaths) {
      const filePath = resolve(raw);
      try {
        const s = await stat(filePath);
        if (!s.isFile()) throw new Error(`not a file: ${filePath}`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`cannot read attachment "${raw}": ${msg}`);
      }
      const filename = basename(filePath);
      attachments.push({
        path: filePath,
        filename,
        contentType: getMimeType(filename),
      });
    }
  }

  return client.sendEmail({
    inboxId,
    to,
    subject,
    body,
    bodyHtml,
    threadId,
    idempotencyKey,
    attachments,
  });
}
