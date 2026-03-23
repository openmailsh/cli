import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { ParsedArgs } from "../lib/args";
import { getStringFlag } from "../lib/args";
import type { CliContext } from "../lib/output";
import type { OpenMailHttpClient } from "../lib/http";
import { readCliState } from "../lib/state";

export type StatusResult = {
  ok: boolean;
  api: {
    baseUrl: string;
    health: "ok" | "error";
    apiKeySource: "flag_or_env" | "state" | "missing";
    auth: "ok" | "error" | "skipped";
  };
  setup: {
    usageMode: "tool" | "notify" | "channel" | "unknown";
    transportMode: "poll" | "websocket" | "webhook" | null;
    openclawHome: string;
    files: {
      env: boolean;
      skill: boolean;
      systemdUnit: boolean;
    };
  };
  bridge: {
    type: "systemd" | "manual_or_unknown";
    status:
      | "active"
      | "activating"
      | "deactivating"
      | "inactive"
      | "failed"
      | "not_found"
      | "unknown";
  };
};

export async function runStatusCommand(params: {
  parsed: ParsedArgs;
  ctx: CliContext;
  baseUrl: string;
  apiKey?: string;
  statePath: string;
  clientFactory: (apiKey: string) => OpenMailHttpClient;
}): Promise<StatusResult> {
  const _ctx = params.ctx;
  const state = await readCliState(params.statePath);
  const openclawHome =
    getStringFlag(params.parsed.flags, "openclaw-home") ??
    process.env.OPENCLAW_HOME ??
    path.join(os.homedir(), ".openclaw");

  const envPath = path.join(openclawHome, "openmail.env");
  const skillPath = path.join(openclawHome, "skills", "openmail", "SKILL.md");
  const systemdUnitPath = path.join(
    os.homedir(),
    ".config",
    "systemd",
    "user",
    "openmail-openclaw-bridge.service",
  );

  const apiKey = params.apiKey ?? state.savedApiKey;
  const apiKeySource: StatusResult["api"]["apiKeySource"] = params.apiKey
    ? "flag_or_env"
    : state.savedApiKey
      ? "state"
      : "missing";

  const health = await probeHealth(params.baseUrl);
  const auth = apiKey ? await probeAuth(params.clientFactory(apiKey)) : "skipped";

  const [envExists, skillExists, systemdUnitExists] = await Promise.all([
    fileExists(envPath),
    fileExists(skillPath),
    fileExists(systemdUnitPath),
  ]);

  const bridge = checkBridgeStatus(systemdUnitExists);

  return {
    ok: true,
    api: {
      baseUrl: params.baseUrl,
      health,
      apiKeySource,
      auth,
    },
    setup: {
      usageMode: state.defaultUsageMode ?? (state.defaultSetupMode ? "notify" : "unknown"),
      transportMode: state.defaultTransportMode ?? state.defaultSetupMode ?? null,
      openclawHome,
      files: {
        env: envExists,
        skill: skillExists,
        systemdUnit: systemdUnitExists,
      },
    },
    bridge,
  };
}

async function probeHealth(baseUrl: string): Promise<"ok" | "error"> {
  try {
    const res = await fetch(`${baseUrl}/health`);
    return res.ok ? "ok" : "error";
  } catch {
    return "error";
  }
}

async function probeAuth(client: OpenMailHttpClient): Promise<"ok" | "error"> {
  try {
    await client.get("/v1/inboxes", { limit: 1, offset: 0 });
    return "ok";
  } catch {
    return "error";
  }
}

function checkBridgeStatus(
  systemdUnitExists: boolean,
): StatusResult["bridge"] {
  if (!systemdUnitExists) {
    return {
      type: "manual_or_unknown",
      status: "unknown",
    };
  }
  if (process.platform !== "linux") {
    return {
      type: "systemd",
      status: "unknown",
    };
  }

  const active = spawnSync(
    "systemctl",
    ["--user", "is-active", "openmail-openclaw-bridge.service"],
    { encoding: "utf8" },
  );
  const value = active.stdout?.trim();
  if (active.status === 0 && value === "active") {
    return { type: "systemd", status: "active" };
  }
  if (value === "activating") {
    return { type: "systemd", status: "activating" };
  }
  if (value === "deactivating") {
    return { type: "systemd", status: "deactivating" };
  }
  if (value === "failed") {
    return { type: "systemd", status: "failed" };
  }
  if (value === "inactive") {
    return { type: "systemd", status: "inactive" };
  }
  if (value === "not-found") {
    return { type: "systemd", status: "not_found" };
  }
  return { type: "systemd", status: "unknown" };
}

async function fileExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}
