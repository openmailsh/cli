// The OpenClaw integration (setup, status, doctor, the WebSocket bridge) moved
// to the @openmail/openclaw plugin in 0.7.0. Users on the old flow still type
// the old commands and still have the old bridge service on disk; meet both
// with a pointer instead of "unknown command".
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const REMOVED_OPENCLAW_COMMANDS = new Set(["setup", "openclaw", "status", "doctor"]);

export const PLUGIN_INSTALL = "openclaw plugins install clawhub:@openmail/openclaw";

export function removedCommandMessage(command: string): string {
  return [
    `\`openmail ${command}\` was removed in 0.7.0.`,
    "The OpenClaw integration is now a plugin that runs inside the OpenClaw gateway:",
    "",
    `  ${PLUGIN_INSTALL}`,
    "  openclaw channels add --channel openmail --api-key <account or inbox key>",
    "",
    "It replaces the CLI bridge, skill files and env setup; the CLI itself stays for API commands.",
    "Docs: https://docs.openmail.sh/integrations/openclaw",
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
    `Found the old OpenMail bridge service at ${servicePath}.`,
    "Since 0.7.0 the CLI no longer runs it; the OpenClaw plugin does the same job inside the gateway.",
    `  Stop it:  ${stop}`,
    `  Replace:  ${PLUGIN_INSTALL}`,
  ].join("\n");
}
