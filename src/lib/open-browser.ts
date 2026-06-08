import { spawn, spawnSync } from "node:child_process";

function commandExists(command: string): boolean {
  if (process.platform === "win32") {
    return spawnSync("where", [command], { stdio: "ignore" }).status === 0;
  }
  return (
    spawnSync("command", ["-v", command], { stdio: "ignore", shell: true })
      .status === 0
  );
}

function browserCommand():
  | { command: string; args: (url: string) => string[] }
  | null {
  if (process.platform === "darwin") {
    return { command: "open", args: (url) => [url] };
  }
  if (process.platform === "win32") {
    return { command: "cmd", args: (url) => ["/c", "start", "", url] };
  }
  if (!commandExists("xdg-open")) {
    return null;
  }
  return { command: "xdg-open", args: (url) => [url] };
}

export function openBrowser(url: string): boolean {
  const spec = browserCommand();
  if (!spec) {
    return false;
  }

  try {
    const child = spawn(spec.command, spec.args(url), {
      detached: true,
      stdio: "ignore",
    });
    child.on("error", () => {
      // Async spawn failures (e.g. ENOENT) must not crash the CLI.
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
