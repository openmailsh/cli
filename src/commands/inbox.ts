import type { ParsedArgs } from "../lib/args";
import { getNumberFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

export async function runInboxCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) {
    throw new Error("missing inbox action (create|list|get|delete|keys)");
  }

  if (action === "create") {
    const mailboxName = getStringFlag(parsed.flags, "mailbox-name");
    const displayName = getStringFlag(parsed.flags, "display-name");
    const domain = getStringFlag(parsed.flags, "domain");
    const podId = getStringFlag(parsed.flags, "pod-id");
    return client.post("/v1/inboxes", {
      ...(mailboxName ? { mailboxName } : {}),
      ...(displayName ? { displayName } : {}),
      ...(domain ? { domain } : {}),
      ...(podId ? { podId } : {}),
    });
  }

  if (action === "list") {
    const limit = getNumberFlag(parsed.flags, "limit");
    const offset = getNumberFlag(parsed.flags, "offset");
    const podId = getStringFlag(parsed.flags, "pod-id");
    return client.get("/v1/inboxes", { limit, offset, podId });
  }

  if (action === "get") {
    return client.get(inboxPath(parsed));
  }

  if (action === "delete") {
    return client.delete(inboxPath(parsed));
  }

  if (action === "keys") {
    return runInboxKeysCommand(client, parsed);
  }

  throw new Error(`unknown inbox action: ${action}`);
}

/**
 * `inbox keys create|list|revoke --inbox-id <id>`: manage inbox-scoped API
 * keys. Needs an account-wide or pod-scoped key; an inbox-scoped key cannot
 * mint further keys (the API answers 403). The raw token is returned once,
 * at creation, and never retrievable again.
 */
async function runInboxKeysCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[2];
  if (!action) {
    throw new Error("missing inbox keys action (create|list|revoke)");
  }
  const base = `${inboxPath(parsed)}/api-keys`;

  if (action === "create") {
    const name = getStringFlag(parsed.flags, "name");
    return client.post(base, name ? { name } : {});
  }

  if (action === "list") {
    return client.get(base);
  }

  if (action === "revoke") {
    const keyId = getStringFlag(parsed.flags, "key-id");
    if (!keyId) {
      throw new Error("missing --key-id");
    }
    return client.delete(`${base}/${encodeURIComponent(keyId)}`);
  }

  throw new Error(`unknown inbox keys action: ${action}`);
}

// `--id` is accepted as an undocumented alias so existing `inbox get|delete
// --id` invocations in installed skills keep working.
function inboxPath(parsed: ParsedArgs): string {
  const inboxId = getStringFlag(parsed.flags, "inbox-id") ?? getStringFlag(parsed.flags, "id");
  if (!inboxId) {
    throw new Error("missing --inbox-id");
  }
  return `/v1/inboxes/${encodeURIComponent(inboxId)}`;
}
