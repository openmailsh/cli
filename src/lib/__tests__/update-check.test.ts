import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  fetchLatestVersion,
  getLatestVersionCached,
  isNewerVersion,
} from "../update-check";
import { readCliState, writeCliState } from "../state";

describe("isNewerVersion", () => {
  it("compares patch, minor, and major segments", () => {
    expect(isNewerVersion("0.4.1", "0.4.0")).toBe(true);
    expect(isNewerVersion("0.5.0", "0.4.9")).toBe(true);
    expect(isNewerVersion("1.0.0", "0.9.9")).toBe(true);
    expect(isNewerVersion("0.4.0", "0.4.0")).toBe(false);
    expect(isNewerVersion("0.4.0", "0.4.1")).toBe(false);
    expect(isNewerVersion("0.4.0", "1.0.0")).toBe(false);
  });

  it("tolerates a leading v and never reports garbage as newer", () => {
    expect(isNewerVersion("v0.5.0", "0.4.0")).toBe(true);
    expect(isNewerVersion("not-a-version", "0.4.0")).toBe(false);
  });
});

describe("getLatestVersionCached", () => {
  const tmpStatePath = () =>
    path.join(
      os.tmpdir(),
      `openmail-cli-test-${process.pid}-${Math.random().toString(36).slice(2)}`,
      "state.json",
    );

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("serves the cached version without a fetch inside the check interval", async () => {
    const statePath = tmpStatePath();
    await writeCliState(statePath, {
      lastUpdateCheckAt: new Date().toISOString(),
      latestKnownVersion: "9.9.9",
    });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(getLatestVersionCached(statePath)).resolves.toBe("9.9.9");
    expect(fetchSpy).not.toHaveBeenCalled();
    await fs.rm(path.dirname(statePath), { recursive: true, force: true });
  });

  it("fetches and persists when the cache is stale", async () => {
    const statePath = tmpStatePath();
    await writeCliState(statePath, {
      savedApiKey: "om_test",
      lastUpdateCheckAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(),
      latestKnownVersion: "0.1.0",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ version: "0.5.0" }),
      }),
    );

    await expect(getLatestVersionCached(statePath)).resolves.toBe("0.5.0");
    const state = await readCliState(statePath);
    expect(state.latestKnownVersion).toBe("0.5.0");
    expect(state.savedApiKey).toBe("om_test");
    await fs.rm(path.dirname(statePath), { recursive: true, force: true });
  });

  it("resolves null when the registry is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(fetchLatestVersion()).resolves.toBeNull();
  });
});
