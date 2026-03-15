import type { ParsedArgs } from "../lib/args";
import { getNumberFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

export async function runInboxCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) {
    throw new Error("missing inbox action (create|list|get|delete)");
  }

  if (action === "create") {
    const mailboxName = getStringFlag(parsed.flags, "mailbox-name");
    const displayName = getStringFlag(parsed.flags, "display-name");
    return client.post("/v1/inboxes", {
      ...(mailboxName ? { mailboxName } : {}),
      ...(displayName ? { displayName } : {}),
    });
  }

  if (action === "list") {
    const limit = getNumberFlag(parsed.flags, "limit");
    const offset = getNumberFlag(parsed.flags, "offset");
    return client.get("/v1/inboxes", { limit, offset });
  }

  if (action === "get") {
    const id = getStringFlag(parsed.flags, "id");
    if (!id) {
      throw new Error("missing --id");
    }
    return client.get(`/v1/inboxes/${encodeURIComponent(id)}`);
  }

  if (action === "delete") {
    const id = getStringFlag(parsed.flags, "id");
    if (!id) {
      throw new Error("missing --id");
    }
    return client.delete(`/v1/inboxes/${encodeURIComponent(id)}`);
  }

  throw new Error(`unknown inbox action: ${action}`);
}
