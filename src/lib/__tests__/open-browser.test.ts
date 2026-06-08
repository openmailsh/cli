import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();
const spawnSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawn: (...args: unknown[]) => spawnMock(...args),
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args),
}));

const originalPlatform = process.platform;

describe("openBrowser", () => {
  beforeEach(() => {
    vi.resetModules();
    spawnMock.mockReset();
    spawnSyncMock.mockReset();
    spawnMock.mockReturnValue({
      on: vi.fn(),
      unref: vi.fn(),
    });
  });

  afterEach(() => {
    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  it("returns false on Linux when xdg-open is missing", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    spawnSyncMock.mockReturnValue({ status: 1 });

    const { openBrowser } = await import("../open-browser");
    expect(openBrowser("https://example.com")).toBe(false);
    expect(spawnMock).not.toHaveBeenCalled();
  });

  it("opens the URL when xdg-open is available on Linux", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    spawnSyncMock.mockReturnValue({ status: 0 });

    const { openBrowser } = await import("../open-browser");
    expect(openBrowser("https://example.com")).toBe(true);
    expect(spawnMock).toHaveBeenCalledWith(
      "xdg-open",
      ["https://example.com"],
      expect.objectContaining({ detached: true, stdio: "ignore" }),
    );
  });

  it("registers an error handler on the child process", async () => {
    Object.defineProperty(process, "platform", { value: "darwin" });
    const on = vi.fn();
    spawnMock.mockReturnValue({ on, unref: vi.fn() });

    const { openBrowser } = await import("../open-browser");
    openBrowser("https://example.com");

    expect(on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("swallows async spawn errors instead of crashing the process", async () => {
    Object.defineProperty(process, "platform", { value: "linux" });
    spawnSyncMock.mockReturnValue({ status: 0 });

    let errorHandler: ((err: Error) => void) | undefined;
    const on = vi.fn((event: string, handler: (err: Error) => void) => {
      if (event === "error") {
        errorHandler = handler;
      }
    });
    spawnMock.mockReturnValue({ on, unref: vi.fn() });

    const { openBrowser } = await import("../open-browser");
    expect(() => openBrowser("https://example.com")).not.toThrow();
    expect(errorHandler).toBeDefined();

    const err = Object.assign(new Error("spawn xdg-open ENOENT"), {
      code: "ENOENT",
      syscall: "spawn xdg-open",
    });
    expect(() => errorHandler!(err)).not.toThrow();
  });
});
