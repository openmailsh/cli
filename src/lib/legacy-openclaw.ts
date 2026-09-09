// The OpenClaw integration (setup, status, doctor, the WebSocket bridge) moved
// to the @openmail/openclaw plugin in 0.7.0. Users on the old flow still type
// the old commands and still have the old bridge service on disk; meet both
// with a pointer instead of "unknown command".
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const REMOVED_OPENCLAW_COMMANDS = new Set(["setup", "openclaw", "status", "doctor"]);

export const PLUGIN_INSTALL = "openclaw plugins install clawhub:@openmail/openclaw";

export const DOCS_URL = "https://docs.openmail.sh/integrations/openclaw";

export function removedCommandMessage(command: string): string {
  // `setup` was the generic "get me an inbox" entry point before 0.7; most
  // people typing it just want an inbox, not OpenClaw. Lead with `init`.
  if (command === "setup") {
    return [
      "`openmail setup` was removed in 0.7.0. To create an inbox, run:",
      "",
      "  openmail init",
      "",
      "Using OpenClaw? The integration is a plugin now:",
      "",
      `  ${PLUGIN_INSTALL}`,
      "  openclaw channels add --channel openmail --api-key <key>",
      "",
      `More: ${DOCS_URL}`,
    ].join("\n");
  }
  return [
    `\`openmail ${command}\` was removed in 0.7.0. Use the OpenClaw plugin:`,
    "",
    `  ${PLUGIN_INSTALL}`,
    "  openclaw channels add --channel openmail --api-key <key>",
    "",
    `More: ${DOCS_URL}`,
  ].join("\n");
}

/** Path of the pre-0.7 bridge service if this machine still has one. */
export function findLegacyBridgeService(homeDir = os.homedir(), platform = process.platform): string | null {
  const candidates =
    platform === "darwin"
      ? [path.join(homeDir, "Library", "LaunchAgents", "sh.openmail.openclaw-bridge.plist")]
      : platform === "linux"
        ? [path.join(homeDir, ".config", "systemd", "user", "openmail-openclaw-bridge.service")]
        : [];
  return candidates.find((p) => existsSync(p)) ?? null;
}

export function legacyBridgeNotice(servicePath: string, platform = process.platform): string {
  const stop =
    platform === "darwin"
      ? `launchctl unload -w "${servicePath}" && rm "${servicePath}"`
      : "systemctl --user disable --now openmail-openclaw-bridge.service";
  return [
    "The OpenMail bridge is deprecated. Stop it and use the OpenClaw plugin:",
    "",
    `  ${stop}`,
    `  ${PLUGIN_INSTALL}`,
    "",
    `More: ${DOCS_URL}#upgrading-from-the-cli-bridge`,
  ].join("\n");
}
