import type { ParsedArgs } from "../lib/args";
import { getNumberFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

type CreatedInbox = { id: string; address: string; podId: string | null };

export async function runInboxCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) {
    throw new Error("missing inbox action (create|spawn|list|get|delete|keys)");
  }

  if (action === "create") {
    return client.post("/v1/inboxes", buildCreateBody(parsed));
  }

  if (action === "spawn") {
    return spawnInbox(client, parsed);
  }

  if (action === "list") {
    const limit = getNumberFlag(parsed.flags, "limit");
    const offset = getNumberFlag(parsed.flags, "offset");
    return client.get("/v1/inboxes", { limit, offset });
  }

  if (action === "get") {
    const id = requireId(parsed);
    return client.get(`/v1/inboxes/${encodeURIComponent(id)}`);
  }

  if (action === "delete") {
    const id = requireId(parsed);
    return client.delete(`/v1/inboxes/${encodeURIComponent(id)}`);
  }

  if (action === "keys") {
    return runInboxKeysCommand(client, parsed);
  }

  throw new Error(`unknown inbox action: ${action}`);
}

/**
 * `inbox keys create|list|revoke --id <inbox_id>`: manage inbox-scoped API
 * keys. Needs an account-wide or pod-scoped key; an inbox-scoped key cannot
 * mint further keys (the API answers 403).
 */
async function runInboxKeysCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[2];
  if (!action) {
    throw new Error("missing inbox keys action (create|list|revoke)");
  }
  const inboxId = requireId(parsed);
  const base = `/v1/inboxes/${encodeURIComponent(inboxId)}/api-keys`;

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

/**
 * Create an inbox and mint an inbox-scoped key for it in one step. This is
 * how a parent agent holding a pod-scoped key provisions a child: the child
 * gets `apiKey.token` and can only read/send from `inbox`, nothing else.
 *
 * The raw token is returned once and never retrievable again. If minting
 * fails the inbox is deleted so a key-less inbox is not left behind.
 */
async function spawnInbox(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const inbox = (await client.post("/v1/inboxes", buildCreateBody(parsed))) as CreatedInbox;
  const keyName = getStringFlag(parsed.flags, "key-name");
  try {
    const apiKey = await client.post(
      `/v1/inboxes/${encodeURIComponent(inbox.id)}/api-keys`,
      keyName ? { name: keyName } : {},
    );
    return { inbox, apiKey };
  } catch (err) {
    await client.delete(`/v1/inboxes/${encodeURIComponent(inbox.id)}`).catch(() => undefined);
    throw err;
  }
}

function buildCreateBody(parsed: ParsedArgs) {
  const mailboxName = getStringFlag(parsed.flags, "mailbox-name");
  const displayName = getStringFlag(parsed.flags, "display-name");
  const domain = getStringFlag(parsed.flags, "domain");
  const webhookUrl = getStringFlag(parsed.flags, "webhook-url");
  return {
    ...(mailboxName ? { mailboxName } : {}),
    ...(displayName ? { displayName } : {}),
    ...(domain ? { domain } : {}),
    ...(webhookUrl ? { webhookUrl } : {}),
  };
}

function requireId(parsed: ParsedArgs): string {
  const id = getStringFlag(parsed.flags, "id");
  if (!id) {
    throw new Error("missing --id");
  }
  return id;
}
