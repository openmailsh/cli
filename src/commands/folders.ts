import { getStringFlag, type ParsedArgs } from "../lib/args";
import { resolveInboxIdWithFallback, type InboxCommandContext } from "../lib/inbox-default";

const maxInt32 = 2147483647;
const sharedFlags = ["inbox-id", "api-key", "base-url", "state-path", "json", "verbose"];

function integerFlag(parsed: ParsedArgs, flag: string, min: number, max: number) {
  if (!(flag in parsed.flags)) return undefined;
  const raw = getStringFlag(parsed.flags, flag);
  const value = Number(raw);
  if (!raw || !/^\d+$/.test(raw) || value < min || value > max) {
    throw new Error(`--${flag} must be an integer from ${min} to ${max}`);
  }
  return value;
}

export async function runFoldersCommand(params: InboxCommandContext) {
  const { client, parsed } = params;
  const [, action, extra] = parsed.command;
  if (action !== "list" && action !== "messages") throw new Error("expected folders action (list|messages)");
  if (extra) throw new Error(`unexpected argument for folders ${action}: ${extra}`);
  const allowed = action === "list" ? sharedFlags : [...sharedFlags, "folder-id", "limit", "offset"];
  for (const flag of Object.keys(parsed.flags)) {
    if (!allowed.includes(flag)) throw new Error(`folders ${action} does not support --${flag}`);
  }
  if ("inbox-id" in parsed.flags && !getStringFlag(parsed.flags, "inbox-id")) {
    throw new Error("--inbox-id requires an ID");
  }
  const folderId = integerFlag(parsed, "folder-id", 1, maxInt32);
  if (action === "messages" && folderId === undefined) {
    throw new Error("missing --folder-id (use the ID from `openmail folders list`)");
  }
  const limit = integerFlag(parsed, "limit", 1, 100);
  const offset = integerFlag(parsed, "offset", 0, maxInt32);
  const inboxId = await resolveInboxIdWithFallback(params);
  const path = `/v1/inboxes/${encodeURIComponent(inboxId)}/folders`;
  if (action === "list") return client.get(path);
  return client.get(`${path}/${folderId}/messages`, { limit, offset });
}
