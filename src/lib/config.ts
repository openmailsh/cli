import os from "node:os";
import path from "node:path";
import { getBooleanFlag, getStringFlag } from "./args";
import type { ParsedArgs } from "./args";
import type { CliContext } from "./output";

export type GlobalConfig = {
  apiKey?: string;
  baseUrl: string;
  statePath: string;
  output: "human" | "json";
  verbose: boolean;
};

export type BridgeConfig = {
  hookUrl: string;
  hookToken: string;
  statePath: string;
  inboxIds?: string[];
  eventTypes?: string[];
};

export function resolveGlobalConfig(parsed: ParsedArgs): GlobalConfig {
  const apiKey = getStringFlag(parsed.flags, "api-key") ?? process.env.OPENMAIL_API_KEY;
  const baseUrl =
    getStringFlag(parsed.flags, "base-url") ??
    process.env.OPENMAIL_BASE_URL ??
    "https://api.openmail.sh";
  const statePath =
    getStringFlag(parsed.flags, "state-path") ??
    process.env.OPENMAIL_STATE_PATH ??
    path.join(os.homedir(), ".openmail-cli", "state.json");
  const output = getBooleanFlag(parsed.flags, "json") ? "json" : "human";
  const verbose = getBooleanFlag(parsed.flags, "verbose");
  return {
    apiKey,
    baseUrl: normalizeBaseUrl(baseUrl),
    statePath,
    output,
    verbose,
  };
}

export function resolveBridgeConfig(parsed: ParsedArgs, globalStatePath: string): BridgeConfig {
  const hookUrl =
    getStringFlag(parsed.flags, "hook-url") ?? process.env.OPENCLAW_HOOK_URL ?? "";
  const hookToken =
    getStringFlag(parsed.flags, "hook-token") ?? process.env.OPENCLAW_HOOK_TOKEN ?? "";
  const statePath =
    getStringFlag(parsed.flags, "state-path") ??
    process.env.OPENMAIL_BRIDGE_STATE_PATH ??
    globalStatePath;

  const inboxIds = parseCsv(
    getStringFlag(parsed.flags, "inbox-ids") ?? process.env.OPENMAIL_BRIDGE_INBOX_IDS,
  );
  const eventTypes = parseCsv(
    getStringFlag(parsed.flags, "event-types") ?? process.env.OPENMAIL_BRIDGE_EVENT_TYPES,
  );

  if (!hookUrl) {
    throw new Error("missing hook URL (set --hook-url or OPENCLAW_HOOK_URL)");
  }
  if (!hookToken) {
    throw new Error("missing hook token (set --hook-token or OPENCLAW_HOOK_TOKEN)");
  }
  return { hookUrl, hookToken, statePath, inboxIds, eventTypes };
}

export function requireApiKey(config: GlobalConfig) {
  if (!config.apiKey) {
    throw new Error("missing API key (set --api-key or OPENMAIL_API_KEY)");
  }
}

export function ctxFromConfig(config: GlobalConfig): CliContext {
  return {
    output: config.output,
    verbose: config.verbose,
  };
}

function normalizeBaseUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) {
    return "https://api.openmail.sh";
  }
  return trimmed;
}

function parseCsv(value: string | undefined): string[] | undefined {
  if (!value) {
    return undefined;
  }
  const entries = value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return entries.length > 0 ? entries : undefined;
}
