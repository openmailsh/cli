#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { cancel, intro, isCancel, select, text } from "@clack/prompts";

const cliDir = process.cwd();

function bump(version: string, type: "patch" | "minor" | "major"): string {
  const [major, minor, patch] = version.split(".").map(Number);
  if (type === "patch") return `${major}.${minor}.${patch + 1}`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  return `${major + 1}.0.0`;
}

async function main() {
  const pkgPath = path.join(cliDir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8")) as { version: string };
  const current = pkg.version;

  intro("Release @openmail/cli");

  const bumpType = await select({
    message: "Version bump",
    options: [
      { value: "patch", label: `Patch (${current} → ${bump(current, "patch")}) - bug fixes` },
      { value: "minor", label: `Minor (${current} → ${bump(current, "minor")}) - new features` },
      { value: "major", label: `Major (${current} → ${bump(current, "major")}) - breaking changes` },
    ],
  });

  if (isCancel(bumpType)) {
    cancel("Release cancelled.");
    process.exit(1);
  }

  const message = await text({
    message: "Version message (optional)",
    placeholder: "e.g. Fix API key fallback from state",
  });

  if (isCancel(message)) {
    cancel("Release cancelled.");
    process.exit(1);
  }

  function run(cmd: string, args: string[]): boolean {
    const r = spawnSync(cmd, args, {
      cwd: cliDir,
      stdio: "inherit",
    });
    return r.status === 0;
  }

  const newVersion = bump(current, bumpType as "patch" | "minor" | "major");
  const versionArgs = message?.trim()
    ? [bumpType, "-m", message.trim()]
    : [bumpType];
  if (!run("npm", ["version", ...versionArgs])) {
    console.error("npm version failed.");
    process.exit(1);
  }

  console.log("\nPushing tag to GitHub...");

  if (!run("git", ["push", "--follow-tags"])) {
    console.error("Push failed. Rolling back version bump...");
    run("git", ["tag", "-d", `v${newVersion}`]);
    run("git", ["reset", "--soft", "HEAD~1"]);
    console.error("Rolled back to version", current);
    process.exit(1);
  }

  console.log(`\n✓ Tag v${newVersion} pushed — GitHub Actions will build, publish to npm, and create a GitHub Release.`);
}

main();
