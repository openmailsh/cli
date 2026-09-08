import fs from "node:fs";
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

/**
 * Read the API key saved by `openmail init` from the CLI state file.
 * Returns undefined if the file doesn't exist or has no saved key.
 */
function readSavedApiKey(statePath: string): string | undefined {
  try {
    const content = fs.readFileSync(statePath, "utf-8");
    const state = JSON.parse(content) as { savedApiKey?: string };
    return state.savedApiKey || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Read a value from a .env file in the current directory.
 * Returns undefined if the file doesn't exist or the key isn't found.
 */
function readDotenv(key: string): string | undefined {
  let content: string;
  try {
    content = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8");
  } catch {
    return undefined;
  }
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const k = trimmed.slice(0, eqIdx).trim();
    if (k !== key) continue;
    let v = trimmed.slice(eqIdx + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    return v || undefined;
  }
  return undefined;
}

export function resolveGlobalConfig(parsed: ParsedArgs): GlobalConfig {
  const statePath =
    getStringFlag(parsed.flags, "state-path") ??
    process.env.OPENMAIL_STATE_PATH ??
    readDotenv("OPENMAIL_STATE_PATH") ??
    path.join(os.homedir(), ".openmail-cli", "state.json");
  const apiKey =
    getStringFlag(parsed.flags, "api-key") ??
    process.env.OPENMAIL_API_KEY ??
    readDotenv("OPENMAIL_API_KEY") ??
    readSavedApiKey(statePath);
  const baseUrl =
    getStringFlag(parsed.flags, "base-url") ??
    process.env.OPENMAIL_BASE_URL ??
    readDotenv("OPENMAIL_BASE_URL") ??
    "https://api.openmail.sh";
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
