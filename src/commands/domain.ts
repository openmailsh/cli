import type { ParsedArgs } from "../lib/args";
import { getNumberFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

/**
 * `domain …`: custom sending domains. `add` returns the DNS records to
 * publish; `verify` re-checks them. Pass --pod-id to scope a domain to one
 * pod (a pod-scoped key may only pass its own pod).
 */
export async function runDomainCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) {
    throw new Error("missing domain action (add|list|get|verify|delete)");
  }

  if (action === "add") {
    const domain = getStringFlag(parsed.flags, "domain");
    if (!domain) {
      throw new Error("missing --domain");
    }
    const podId = getStringFlag(parsed.flags, "pod-id");
    return client.post("/v1/domains", { domain, ...(podId ? { podId } : {}) });
  }

  if (action === "list") {
    const limit = getNumberFlag(parsed.flags, "limit");
    const offset = getNumberFlag(parsed.flags, "offset");
    return client.get("/v1/domains", { limit, offset });
  }

  if (action === "get") {
    return client.get(domainPath(parsed));
  }

  if (action === "verify") {
    return client.post(`${domainPath(parsed)}/verify`);
  }

  if (action === "delete") {
    return client.delete(domainPath(parsed));
  }

  throw new Error(`unknown domain action: ${action}`);
}

function domainPath(parsed: ParsedArgs): string {
  const domainId = getStringFlag(parsed.flags, "domain-id");
  if (!domainId) {
    throw new Error("missing --domain-id");
  }
  return `/v1/domains/${encodeURIComponent(domainId)}`;
}
