import type { ParsedArgs } from "../lib/args";
import { countFlagOccurrences, getRepeatedStringFlag, getStringFlag } from "../lib/args";
import { ApiError, type OpenMailHttpClient } from "../lib/http";

export async function runDraftsCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) throw new Error("missing drafts action (create|list|get|send)");
  if (!["create", "list", "get", "send"].includes(action)) throw new Error(`unknown drafts action: ${action}`);
  const inboxId = getStringFlag(parsed.flags, "inbox-id");
  const path = "/v1/drafts";

  if (action === "create") {
    for (const flag of ["attach", "thread-id", "reply-to", "no-quote"]) {
      if (flag in parsed.flags) throw new Error(`drafts create does not support --${flag}; attachment and reply drafts can be saved in the console`);
    }
    if (countFlagOccurrences("to") > 1) throw new Error("--to may only be given once; use --cc or --bcc for additional recipients");
    const body: Record<string, unknown> = inboxId ? { inboxId } : {};
    for (const [flag, field] of [["to", "to"], ["subject", "subject"], ["body", "body"], ["body-html", "bodyHtml"]]) {
      const value = parsed.flags[flag];
      if (value !== undefined) {
        if (typeof value !== "string") throw new Error(`--${flag} requires a value`);
        body[field] = value;
      }
    }
    for (const flag of ["cc", "bcc"]) {
      const values = getRepeatedStringFlag(flag);
      if (values.length) body[flag] = values;
      else if (flag in parsed.flags) throw new Error(`--${flag} requires a value`);
    }
    return client.post(path, body);
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
    return client.get(path, { ...pagination, inboxId, q: getStringFlag(parsed.flags, "query") });
  }
  const draftId = getStringFlag(parsed.flags, "draft-id");
  if (!draftId) throw new Error("missing --draft-id");
  const draftPath = `${path}/${encodeURIComponent(draftId)}`;
  if (action === "get") {
    if (inboxId) throw new Error("drafts get uses only --draft-id; choose --inbox-id when sending");
    return client.get(draftPath);
  }
  // Do not fetch and substitute the latest version: only send what was reviewed.
  const updatedAt = getStringFlag(parsed.flags, "updated-at");
  if (!updatedAt) throw new Error("missing --updated-at; use the exact updatedAt from the draft you reviewed with `drafts get`");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(updatedAt) || !Number.isFinite(Date.parse(updatedAt))) {
    throw new Error("--updated-at must be an ISO 8601 timestamp with timezone");
  }
  for (const flag of ["to", "cc", "bcc", "subject", "body", "body-html", "attach", "thread-id", "reply-to"]) {
    if (flag in parsed.flags) throw new Error(`drafts send uses stored content; --${flag} cannot override it`);
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
