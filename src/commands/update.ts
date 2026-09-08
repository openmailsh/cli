import { spawnSync } from "node:child_process";
import type { CliContext } from "../lib/output";
import { logInfo } from "../lib/output";
import { fetchLatestVersion, isNewerVersion } from "../lib/update-check";

export type UpdateResult = {
  ok: boolean;
  status: "up_to_date" | "updated";
  from: string;
  to: string;
};

/**
 * Upgrade the globally installed CLI to the latest published version.
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

  return {
    ok: true,
    status: "updated",
    from: currentVersion,
    to: latest,
  };
}
