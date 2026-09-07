import type { ParsedArgs } from "../lib/args";
import { getNumberFlag, getStringFlag } from "../lib/args";
import type { OpenMailHttpClient } from "../lib/http";

const DIRECTIONS = ["inbound", "outbound"] as const;
const MODES = ["none", "allowlist", "inherit"] as const;

/**
 * `policy …`: correspondent policy — who may email an inbox (inbound) and
 * who it may email (outbound). Scope defaults to the whole account; pass
 * --pod-id or --inbox-id to read or change one pod's or one inbox's policy.
 * Inbox-scoped keys are rejected by the API; a pod-scoped key may only touch
 * its own pod and that pod's inboxes.
 */
export async function runPolicyCommand(client: OpenMailHttpClient, parsed: ParsedArgs) {
  const action = parsed.command[1];
  if (!action) {
    throw new Error("missing policy action (get|mode|allow|block|rules|audit)");
  }
  const scope = scopeQuery(parsed);

  if (action === "get") {
    return client.get("/v1/policy", scope);
  }

  if (action === "mode") {
    const mode = requireEnum(parsed, "mode", MODES);
    const direction = requireEnum(parsed, "direction", DIRECTIONS);
    return client.put(withQuery("/v1/policy/mode", scope), { mode, direction });
  }

  if (action === "allow" || action === "block") {
    const value = getStringFlag(parsed.flags, "value");
    if (!value) {
      throw new Error("missing --value (an address, a domain, or *.domain)");
    }
    const direction = requireEnum(parsed, "direction", DIRECTIONS);
    return client.post(withQuery("/v1/policy/rules", scope), { type: action, value, direction });
  }

  if (action === "rules") {
    const sub = parsed.command[2];
    if (sub !== "remove") {
      throw new Error("missing policy rules action (remove)");
    }
    const ruleId = getStringFlag(parsed.flags, "rule-id");
    if (!ruleId) {
      throw new Error("missing --rule-id");
    }
    return client.delete(withQuery(`/v1/policy/rules/${encodeURIComponent(ruleId)}`, scope));
  }

  if (action === "audit") {
    return client.get("/v1/policy/audit", {
      ...scope,
      action: getStringFlag(parsed.flags, "action"),
      direction: getStringFlag(parsed.flags, "direction"),
      since: getStringFlag(parsed.flags, "since"),
      until: getStringFlag(parsed.flags, "until"),
      limit: getNumberFlag(parsed.flags, "limit"),
      offset: getNumberFlag(parsed.flags, "offset"),
    });
  }

  throw new Error(`unknown policy action: ${action}`);
}

function scopeQuery(parsed: ParsedArgs): Record<string, string | undefined> {
  const podId = getStringFlag(parsed.flags, "pod-id");
  const inboxId = getStringFlag(parsed.flags, "inbox-id");
  if (podId && inboxId) {
    throw new Error("pass either --pod-id or --inbox-id, not both");
  }
  return { podId, inboxId };
}

function withQuery(path: string, query: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

function requireEnum<T extends readonly string[]>(
  parsed: ParsedArgs,
  flag: string,
  allowed: T,
): T[number] {
  const value = getStringFlag(parsed.flags, flag);
  if (!value || !allowed.includes(value)) {
    throw new Error(`--${flag} must be one of: ${allowed.join("|")}`);
  }
  return value;
}
