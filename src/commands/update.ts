import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CliContext } from "../lib/output";
import { logInfo } from "../lib/output";
import { fetchLatestVersion, isNewerVersion } from "../lib/update-check";

export type BridgeRestart =
  | "restarted"
  | "not_running"
  | "failed"
  | "manual_restart_needed"
  | "none";

export type UpdateResult = {
  ok: boolean;
  status: "up_to_date" | "updated";
  from: string;
  to: string;
  skillRefresh: "done" | "failed" | "skipped";
  bridge: BridgeRestart;
};

type ExecFn = (cmd: string, args: string[]) => { status: number | null };

const defaultExec: ExecFn = (cmd, args) =>
  spawnSync(cmd, args, { stdio: "ignore" });

/**
 * Restart the notify/channel-mode WebSocket bridge so it picks up the freshly
 * installed code — the service definitions exec the global install path, which
 * `npm install -g` overwrites in place, so a plain restart is enough. Covers
 * the managed runtimes (systemd on Linux, launchd on macOS). A bridge running
 * as a detached plain process has no tracked pid, so it is only detected and
 * reported for a manual restart. Tool-mode installs have no bridge: "none".
 */
export function restartBridgeIfInstalled(deps?: {
  homeDir?: string;
  platform?: NodeJS.Platform;
  exec?: ExecFn;
}): BridgeRestart {
  const homeDir = deps?.homeDir ?? os.homedir();
  const platform = deps?.platform ?? process.platform;
  const exec = deps?.exec ?? defaultExec;

  const systemdUnit = path.join(
    homeDir,
    ".config",
    "systemd",
    "user",
    "openmail-openclaw-bridge.service",
  );
  if (platform === "linux" && existsSync(systemdUnit)) {
    const active = exec("systemctl", [
      "--user",
      "is-active",
      "--quiet",
      "openmail-openclaw-bridge.service",
    ]);
    if (active.status !== 0) return "not_running";
    const restart = exec("systemctl", [
      "--user",
      "restart",
      "openmail-openclaw-bridge.service",
    ]);
    return restart.status === 0 ? "restarted" : "failed";
  }

  const plist = path.join(
    homeDir,
    "Library",
    "LaunchAgents",
    "sh.openmail.openclaw-bridge.plist",
  );
  if (platform === "darwin" && existsSync(plist)) {
    exec("launchctl", ["unload", plist]);
    const load = exec("launchctl", ["load", "-w", plist]);
    return load.status === 0 ? "restarted" : "failed";
  }

  // Detached plain-process bridge (setup's last-resort mode): detect only.
  const found = exec("pgrep", ["-f", "@openmail/cli.* ws bridge"]);
  if (found.status === 0) return "manual_restart_needed";

  return "none";
}

/**
 * Upgrade the globally installed CLI to the latest published version, then
 * re-run `openmail setup` with the NEW binary so the installed skill files
 * are refreshed in the same step (setup is idempotent and non-interactive on
 * an already-configured install).
 */
export async function runUpdateCommand(params: {
  ctx: CliContext;
  currentVersion: string;
}): Promise<UpdateResult> {
  const { ctx, currentVersion } = params;

  const latest = await fetchLatestVersion(5_000);
  if (!latest) {
    throw new Error(
      "could not reach the npm registry to check for updates; try again or run `npm install -g @openmail/cli@latest` directly",
    );
  }

  if (!isNewerVersion(latest, currentVersion)) {
    return {
      ok: true,
      status: "up_to_date",
      from: currentVersion,
      to: currentVersion,
      skillRefresh: "skipped",
      bridge: "none",
    };
  }

  logInfo(ctx, `Updating @openmail/cli ${currentVersion} → ${latest}...`);
  const install = spawnSync(
    "npm",
    ["install", "-g", `@openmail/cli@${latest}`],
    { stdio: ctx.verbose ? "inherit" : "ignore" },
  );
  if (install.status !== 0) {
    throw new Error(
      `npm install failed (exit ${install.status ?? "?"}); try \`npm install -g @openmail/cli@latest\` yourself (a permissions error may need a node version manager or sudo)`,
    );
  }

  // Refresh the installed skill files via the freshly installed binary — the
  // running (old) process would only rewrite its own outdated template.
  // --refresh-skill is prompt-free and network-free: it rewrites installed
  // SKILL.md files and touches nothing else (no inbox/mode flow, no API).
  const refresh = spawnSync("openmail", ["setup", "--refresh-skill"], {
    stdio: "ignore",
  });
  const skillRefresh = refresh.status === 0 ? "done" : "failed";
  if (skillRefresh === "failed") {
    logInfo(
      ctx,
      "Updated, but the skill refresh failed — run `openmail setup --refresh-skill` to refresh skill files.",
    );
  }

  // The bridge (notify/channel mode) is a long-running process that keeps
  // executing the old code until restarted.
  const bridge = restartBridgeIfInstalled();
  if (bridge === "failed") {
    logInfo(
      ctx,
      "Updated, but restarting the notification bridge failed — run `openmail setup` to relaunch it.",
    );
  } else if (bridge === "manual_restart_needed") {
    logInfo(
      ctx,
      "Updated. The notification bridge is running as a plain process on the old version — restart it to pick up the update.",
    );
  }

  return {
    ok: true,
    status: "updated",
    from: currentVersion,
    to: latest,
    skillRefresh,
    bridge,
  };
}
