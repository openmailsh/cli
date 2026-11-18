import { openAsBlob } from "node:fs";
import { resolveAttachment } from "../lib/attachments";
import type { ParsedArgs } from "../lib/args";
import { countFlagOccurrences, getRepeatedStringFlag, getStringFlag } from "../lib/args";
import { ApiError, type OpenMailHttpClient } from "../lib/http";

const globalFlags = ["api-key", "base-url", "state-path", "json", "verbose"];
const actionFlags: Record<string, string[]> = {
  create: ["inbox-id", "thread-id", "source-thread-id", "to", "cc", "bcc", "subject", "body", "body-html", "attach", "inline-image"],
  list: ["inbox-id", "pod-id", "source-thread-id", "query", "limit", "offset"],
  get: ["draft-id"],
  send: ["draft-id", "updated-at", "inbox-id"],
};

function optionalId(parsed: ParsedArgs, flag: string) {
  const value = getStringFlag(parsed.flags, flag);
  if (flag in parsed.flags && !value) throw new Error(`--${flag} requires an ID`);
  return value;
}

function repeatedValues(flag: string) {
  const values = getRepeatedStringFlag(flag);
  if (values.length !== countFlagOccurrences(flag) || values.some(value => !value.trim())) {
    throw new Error(`--${flag} requires a value each time it is used`);
  }
  return values;
}

async function draftRequestBody(fields: Record<string, string | string[]>) {
  const files = repeatedValues("attach").map(path => ({ field: "attachments", path, contentId: "" }));
  for (const value of repeatedValues("inline-image")) {
    const separator = value.indexOf("=");
    const contentId = value.slice(0, separator);
    const path = value.slice(separator + 1);
    const validContentId = /^inline-[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}@openmail$/.test(contentId);
    if (separator < 0 || !validContentId || !path) {
      throw new Error("--inline-image expects inline-<UUID>@openmail=<file> and a matching cid: reference in the HTML");
    }
    files.push({ field: "inlineImages", path, contentId });
  }
  if (!files.length) return fields;

  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    for (const item of Array.isArray(value) ? value : [value]) form.append(key, item);
  }
  let totalBytes = 0;
  for (const file of files) {
    const attachment = await resolveAttachment(file.path);
    const blob = await openAsBlob(attachment.path, { type: attachment.contentType });
    totalBytes += blob.size;
    if (totalBytes > 25 * 1024 * 1024) throw new Error("Total draft attachments cannot exceed 25 MiB");
    form.append(file.field, blob, file.contentId || attachment.filename);
  }
  return form;
}

export async function runDraftsCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) throw new Error("missing drafts action (create|list|get|send)");
  if (!Object.hasOwn(actionFlags, action)) throw new Error(`unknown drafts action: ${action}`);
  if (parsed.command.length > 2) throw new Error(`unexpected argument for drafts ${action}: ${parsed.command[2]}`);
  for (const flag of Object.keys(parsed.flags)) {
    if (!globalFlags.includes(flag) && !actionFlags[action].includes(flag)) {
      throw new Error(`drafts ${action} does not support --${flag}`);
    }
  }
  const inboxId = optionalId(parsed, "inbox-id");
  const path = "/v1/drafts";

  if (action === "create") {
    if (!inboxId) throw new Error("drafts create requires --inbox-id for the sending inbox");
    if (countFlagOccurrences("to") > 1) throw new Error("--to may only be given once; use --cc or --bcc for additional recipients");
    const body: Record<string, string | string[]> = { inboxId };
    const threadId = optionalId(parsed, "thread-id");
    const sourceThreadId = optionalId(parsed, "source-thread-id");
    if (threadId && sourceThreadId && threadId !== sourceThreadId) {
      throw new Error("--source-thread-id must match --thread-id on a reply draft");
    }
    if (threadId) body.threadId = threadId;
    if (sourceThreadId) body.sourceThreadId = sourceThreadId;
    for (const [flag, field] of [["to", "to"], ["subject", "subject"], ["body", "body"], ["body-html", "bodyHtml"]]) {
      const value = parsed.flags[flag];
      if (value !== undefined) {
        if (typeof value !== "string") throw new Error(`--${flag} requires a value`);
        body[field] = value;
      }
    }
    for (const flag of ["cc", "bcc"]) {
      const values = repeatedValues(flag);
      if (values.length) body[flag] = values;
    }
    return client.post(path, await draftRequestBody(body));
  }
  if (action === "list") {
    const pagination: Record<string, number> = {};
    for (const flag of ["limit", "offset"]) {
      if (!(flag in parsed.flags)) continue;
      const raw = getStringFlag(parsed.flags, flag);
      const value = raw === undefined ? NaN : Number(raw);
      if (!Number.isSafeInteger(value) || value < (flag === "limit" ? 1 : 0) || (flag === "limit" && value > 100)) {
        throw new Error(`--${flag} must be ${flag === "limit" ? "an integer from 1 to 100" : "a nonnegative integer"}`);
      }
      pagination[flag] = value;
    }
    if (parsed.flags.query === true) throw new Error("--query requires a search term");
    return client.get(path, {
      ...pagination,
      inboxId,
      podId: optionalId(parsed, "pod-id"),
      sourceThreadId: optionalId(parsed, "source-thread-id"),
      q: getStringFlag(parsed.flags, "query"),
    });
  }
  const draftId = getStringFlag(parsed.flags, "draft-id");
  if (!draftId) throw new Error("missing --draft-id");
  const draftPath = `${path}/${encodeURIComponent(draftId)}`;
  if (action === "get") return client.get(draftPath);
  // Do not fetch and substitute the latest version: only send what was reviewed.
  const updatedAt = getStringFlag(parsed.flags, "updated-at");
  if (!updatedAt) throw new Error("missing --updated-at; use the exact updatedAt from the draft you reviewed with `drafts get`");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(updatedAt) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("--updated-at must be an ISO 8601 timestamp with timezone");
  }
  try {
    return await client.post(`${draftPath}/send`, { updatedAt, ...(inboxId ? { inboxId } : {}) });
  } catch (err) {
    if (err instanceof ApiError && typeof err.body === "object" && err.body !== null) {
      const body = err.body as Record<string, unknown>;
      let message: string | undefined;
      switch (body.error) {
        case "draft_changed":
          message = "The saved draft version no longer matches the reviewed version. Do not send automatically. Run drafts get, show the current sending inbox, To/Cc/Bcc, subject, full body, attachments and reply thread to the user, and obtain approval before sending with its current updatedAt. A failed send can also advance updatedAt without changing the content.";
          break;
        case "send_failed":
          message = "The send attempt failed and the draft is still saved. Its updatedAt may have advanced even though its content did not change. Do not retry automatically. Run drafts get, show the current sending inbox, To/Cc/Bcc, subject, full body, attachments and reply thread to the user, and obtain approval to retry with its current updatedAt. Do not copy the draft into send.";
          break;
        case "draft_sending":
          message = "A send of this draft is still in progress or has already been accepted. Do not retry now, change recipients, or copy it into send. Wait and check the inbox for the sent message and drafts get for the saved draft before considering another send; a missing draft may already have been sent.";
          break;
      }
      if (message) throw new ApiError(message, err.status, { ...body, message });
    }
    throw err;
  }
}
