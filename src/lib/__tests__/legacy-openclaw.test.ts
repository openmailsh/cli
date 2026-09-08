import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  REMOVED_OPENCLAW_COMMANDS,
  findLegacyBridgeService,
  legacyBridgeNotice,
  removedCommandMessage,
} from "../legacy-openclaw";

describe("legacy openclaw pointers", () => {
  it("covers the four removed commands", () => {
    expect([...REMOVED_OPENCLAW_COMMANDS].sort()).toEqual(["doctor", "openclaw", "setup", "status"]);
  });

  it("names the command and the plugin install", () => {
    const msg = removedCommandMessage("setup");
    expect(msg).toContain("`openmail setup` was removed in 0.7.0");
    expect(msg).toContain("openclaw plugins install clawhub:@openmail/openclaw");
  });

  it("finds a launchd bridge on macOS and a systemd unit on Linux", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "omcli-"));
    expect(findLegacyBridgeService(home, "darwin")).toBeNull();

    const plist = path.join(home, "Library", "LaunchAgents", "sh.openmail.openclaw-bridge.plist");
    mkdirSync(path.dirname(plist), { recursive: true });
    writeFileSync(plist, "");
    expect(findLegacyBridgeService(home, "darwin")).toBe(plist);
    expect(findLegacyBridgeService(home, "linux")).toBeNull();

    const unit = path.join(home, ".config", "systemd", "user", "openmail-openclaw-bridge.service");
    mkdirSync(path.dirname(unit), { recursive: true });
    writeFileSync(unit, "");
    expect(findLegacyBridgeService(home, "linux")).toBe(unit);
    expect(legacyBridgeNotice(unit, "linux")).toContain("systemctl --user disable --now");
    expect(legacyBridgeNotice(plist, "darwin")).toContain("launchctl unload -w");
  });
});
