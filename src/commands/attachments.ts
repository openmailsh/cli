import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { ParsedArgs } from "../lib/args";
import { getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

/**
 * `attachments get|text --message-id <id> --attachment-id <id>`. `text` is the
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
  const attachmentId = getStringFlag(parsed.flags, "attachment-id");
  const filename = getStringFlag(parsed.flags, "filename");
  if (!messageId) {
    throw new Error("missing --message-id");
  }
  const selector = attachmentId || filename;
  if (!selector) {
    throw new Error("missing --attachment-id or --filename");
  }
  const base = `/v1/attachments/${encodeURIComponent(messageId)}/${encodeURIComponent(selector)}`;

  if (action === "text") {
    return client.get(`${base}/text`);
  }

  if (action === "get") {
    const output = getStringFlag(parsed.flags, "out");
    const { bytes, contentType, filename: storedName } = await client.download(base);
    const out = output ?? path.win32.basename((attachmentId && storedName) || selector);
    if (!output && (!out || out === "." || out === ".." || out.includes("\0"))) {
      throw new Error("Pass --out to choose a filename for this attachment.");
    }
    // Two IDs can have the same suggested filename. Preserve an existing file
    // unless the user picked its path or used the original filename command.
    await writeFile(out, bytes, { flag: attachmentId && !output ? "wx" : "w" });
    return { ok: true, path: path.resolve(out), bytes: bytes.byteLength, contentType };
  }

  throw new Error(`unknown attachments action: ${action}`);
}
