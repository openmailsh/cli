import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { ParsedArgs } from "../lib/args";
import { getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

/**
 * `attachments get|text --message-id <id> --filename <name>`. `text` is the
 * one agents usually want: the API extracts plain text from PDF, DOCX, XLSX,
 * PPTX and images (OCR) so the agent never has to parse a binary itself.
 * `get` downloads the raw file to --out (default: the attachment's filename
 * in the current directory).
 */
export async function runAttachmentsCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) {
    throw new Error("missing attachments action (get|text)");
  }
  const messageId = getStringFlag(parsed.flags, "message-id");
  const filename = getStringFlag(parsed.flags, "filename");
  if (!messageId) {
    throw new Error("missing --message-id");
  }
  if (!filename) {
    throw new Error("missing --filename");
  }
  const base = `/v1/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(filename)}`;

  if (action === "text") {
    return client.get(`${base}/text`);
  }

  if (action === "get") {
    const out = getStringFlag(parsed.flags, "out") ?? path.basename(filename);
    const { bytes, contentType } = await client.download(base);
    await writeFile(out, bytes);
    return { ok: true, path: path.resolve(out), bytes: bytes.byteLength, contentType };
  }

  throw new Error(`unknown attachments action: ${action}`);
}
