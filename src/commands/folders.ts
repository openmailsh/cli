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

const actionFlags: Record<string, string[]> = {
  list: [], messages: ["folder-id", "limit", "offset"], create: ["name"],
  rename: ["folder-id", "name"], delete: ["folder-id"],
  move: ["message-id", "folder-id"], restore: ["message-id"],
};

export async function runFoldersCommand(params: InboxCommandContext) {
  const { client, parsed } = params;
  const [, action, extra] = parsed.command;
  if (!Object.hasOwn(actionFlags, action)) throw new Error(`expected folders action (${Object.keys(actionFlags).join("|")})`);
  if (extra) throw new Error(`unexpected argument for folders ${action}: ${extra}`);
  const allowed = [...sharedFlags, ...actionFlags[action]];
  for (const flag of Object.keys(parsed.flags)) {
    if (!allowed.includes(flag)) throw new Error(`folders ${action} does not support --${flag}`);
  }
  if ("inbox-id" in parsed.flags && !getStringFlag(parsed.flags, "inbox-id")) {
    throw new Error("--inbox-id requires an ID");
  }
  const folderId = integerFlag(parsed, "folder-id", 1, maxInt32);
  if (actionFlags[action].includes("folder-id") && folderId === undefined) {
    throw new Error("missing --folder-id (use the ID from `openmail folders list`)");
  }
  const limit = integerFlag(parsed, "limit", 1, 100);
  const offset = integerFlag(parsed, "offset", 0, maxInt32);
  const name = getStringFlag(parsed.flags, "name")?.trim();
  const messageId = getStringFlag(parsed.flags, "message-id")?.trim();
  if (actionFlags[action].includes("name") && !name) throw new Error("missing --name");
  if (actionFlags[action].includes("message-id") && !messageId) throw new Error("missing --message-id");
  const inboxId = await resolveInboxIdWithFallback(params);
  const inboxPath = `/v1/inboxes/${encodeURIComponent(inboxId)}`;
  const path = `${inboxPath}/folders`;
  if (action === "create") return client.post(path, { name });
  if (action === "rename") return client.patch(`${path}/${folderId}`, { name });
  if (action === "delete") return client.delete(`${path}/${folderId}`);
  if (messageId) {
    const messagePath = `${inboxPath}/messages/${encodeURIComponent(messageId)}`;
    if (action === "move") return client.put(`${messagePath}/folder`, { folderId });
    return client.post(`${messagePath}/restore`);
  }
  if (action === "list") return client.get(path);
  return client.get(`${path}/${folderId}/messages`, { limit, offset });
}
