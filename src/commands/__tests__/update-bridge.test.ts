import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { restartBridgeIfInstalled } from "../update";

let homeDir: string;

beforeEach(async () => {
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "openmail-bridge-"));
});

afterEach(async () => {
  await fs.rm(homeDir, { recursive: true, force: true });
});

const exec = (results: Record<string, number>) =>
  vi.fn((cmd: string, args: string[]) => {
    const key = `${cmd} ${args.join(" ")}`;
    const match = Object.entries(results).find(([prefix]) =>
      key.startsWith(prefix),
    );
    return { status: match ? match[1] : 1 };
  });

describe("restartBridgeIfInstalled", () => {
  it("restarts an active systemd bridge on linux", async () => {
    const unit = path.join(
      homeDir,
      ".config",
      "systemd",
      "user",
      "openmail-openclaw-bridge.service",
    );
    await fs.mkdir(path.dirname(unit), { recursive: true });
    await fs.writeFile(unit, "[Unit]\n", "utf8");
    const run = exec({ "systemctl --user is-active": 0, "systemctl --user restart": 0 });

    const result = restartBridgeIfInstalled({
      homeDir,
      platform: "linux",
      exec: run,
    });
    expect(result).toBe("restarted");
    expect(run).toHaveBeenCalledWith("systemctl", [
      "--user",
      "restart",
      "openmail-openclaw-bridge.service",
    ]);
  });

  it("leaves an inactive systemd bridge alone", async () => {
    const unit = path.join(
      homeDir,
      ".config",
      "systemd",
      "user",
      "openmail-openclaw-bridge.service",
    );
    await fs.mkdir(path.dirname(unit), { recursive: true });
    await fs.writeFile(unit, "[Unit]\n", "utf8");
    const run = exec({ "systemctl --user is-active": 1 });

    const result = restartBridgeIfInstalled({
      homeDir,
      platform: "linux",
      exec: run,
    });
    expect(result).toBe("not_running");
    expect(run).not.toHaveBeenCalledWith("systemctl", [
      "--user",
      "restart",
      "openmail-openclaw-bridge.service",
    ]);
  });

  it("reloads a launchd bridge on macOS", async () => {
    const plist = path.join(
      homeDir,
      "Library",
      "LaunchAgents",
      "sh.openmail.openclaw-bridge.plist",
    );
    await fs.mkdir(path.dirname(plist), { recursive: true });
    await fs.writeFile(plist, "<plist/>", "utf8");
    const run = exec({ "launchctl unload": 0, "launchctl load": 0 });

    const result = restartBridgeIfInstalled({
      homeDir,
      platform: "darwin",
      exec: run,
    });
    expect(result).toBe("restarted");
  });

  it("reports none when no bridge is installed or running", () => {
    const run = exec({});
    const result = restartBridgeIfInstalled({
      homeDir,
      platform: "linux",
      exec: run,
    });
    expect(result).toBe("none");
  });

  it("detects a plain-process bridge it cannot restart", () => {
    const run = exec({ pgrep: 0 });
    const result = restartBridgeIfInstalled({
      homeDir,
      platform: "linux",
      exec: run,
    });
    expect(result).toBe("manual_restart_needed");
  });
});
