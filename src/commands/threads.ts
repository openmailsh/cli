import type { ParsedArgs } from "../lib/args";
import { getNumberFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

export async function runThreadsCommand(
  client: OpenMailHttpClient,
  parsed: ParsedArgs,
  inboxIdOverride?: string,
) {
  const action = parsed.command[1];
  if (!action) {
    throw new Error("missing threads action (list|get|read|unread)");
  }

  if (action === "list") {
    const inboxId = getStringFlag(parsed.flags, "inbox-id") ?? inboxIdOverride;
    const limit = getNumberFlag(parsed.flags, "limit");
    const offset = getNumberFlag(parsed.flags, "offset");
    const isRead = getStringFlag(parsed.flags, "is-read");
    if (!inboxId) throw new Error("missing inbox id; run `openmail init` or pass --inbox-id");
    return client.get(`/v1/inboxes/${encodeURIComponent(inboxId)}/threads`, {
      limit,
      offset,
      is_read: isRead,
    });
  }

  if (action === "get") {
    const threadId = getStringFlag(parsed.flags, "thread-id");
    if (!threadId) throw new Error("missing --thread-id");
    return client.get(`/v1/threads/${encodeURIComponent(threadId)}/messages`);
  }

  if (action === "read") {
    const threadId = getStringFlag(parsed.flags, "thread-id");
    if (!threadId) throw new Error("missing --thread-id");
    return client.patch(`/v1/threads/${encodeURIComponent(threadId)}`, { is_read: true });
  }

  if (action === "unread") {
    const threadId = getStringFlag(parsed.flags, "thread-id");
    if (!threadId) throw new Error("missing --thread-id");
    return client.patch(`/v1/threads/${encodeURIComponent(threadId)}`, { is_read: false });
  }

  throw new Error(`unknown threads action: ${action}`);
}
