import { stat } from "node:fs/promises";
import { basename, resolve } from "node:path";

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

/** OpenMail sends the original UTF-8 name in the final filename* parameter. */
export function attachmentFilename(disposition: string | null): string | undefined {
  const encoded = disposition?.match(/;\s*filename\*=UTF-8''([^;]+)$/i)?.[1];
  if (!encoded) return undefined;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return undefined;
  }
}

export async function resolveAttachment(raw: string) {
  const path = resolve(raw);
  try {
    const file = await stat(path);
    if (!file.isFile()) throw new Error(`not a file: ${path}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`cannot read attachment "${raw}": ${message}`);
  }
  const filename = basename(path);
  return { path, filename, contentType: getMimeType(filename) };
}
