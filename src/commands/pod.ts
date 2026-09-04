import type { ParsedArgs } from "../lib/args";
import { getNumberFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

/**
 * `pod …`: pods group inboxes and domains, and pod-scoped keys are how an
 * orchestrator hands a sub-agent a key that can only see its own pod. All
 * pod management needs an account-wide key; a pod-scoped key can only read
 * its own pod.
 */
export async function runPodCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) {
    throw new Error("missing pod action (create|list|get|update|delete|keys)");
  }

  if (action === "create") {
    const name = getStringFlag(parsed.flags, "name");
    const clientId = getStringFlag(parsed.flags, "client-id");
    return client.post("/v1/pods", {
      ...(name ? { name } : {}),
      ...(clientId ? { clientId } : {}),
    });
  }

  if (action === "list") {
    const limit = getNumberFlag(parsed.flags, "limit");
    const offset = getNumberFlag(parsed.flags, "offset");
    return client.get("/v1/pods", { limit, offset });
  }

  if (action === "get") {
    return client.get(podPath(parsed));
  }

  if (action === "update") {
    const name = getStringFlag(parsed.flags, "name");
    const clientId = getStringFlag(parsed.flags, "client-id");
    if (!name && !clientId) {
      throw new Error("nothing to update (pass --name and/or --client-id)");
    }
    return client.patch(podPath(parsed), {
      ...(name ? { name } : {}),
      ...(clientId ? { clientId } : {}),
    });
  }

  if (action === "delete") {
    return client.delete(podPath(parsed));
  }

  if (action === "keys") {
    return runPodKeysCommand(client, parsed);
  }

  throw new Error(`unknown pod action: ${action}`);
}

/**
 * `pod keys create|list|revoke --pod-id <id>`: pod-scoped API keys. The raw
 * token is returned once, at creation, and never retrievable again.
 */
async function runPodKeysCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[2];
  if (!action) {
    throw new Error("missing pod keys action (create|list|revoke)");
  }
  const base = `${podPath(parsed)}/api-keys`;

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

  throw new Error(`unknown pod keys action: ${action}`);
}

function podPath(parsed: ParsedArgs): string {
  const podId = getStringFlag(parsed.flags, "pod-id");
  if (!podId) {
    throw new Error("missing --pod-id");
  }
  return `/v1/pods/${encodeURIComponent(podId)}`;
}
