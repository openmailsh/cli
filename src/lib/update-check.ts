import type { CliContext } from "./output";
import { colorize } from "./output";
import { readCliState, writeCliState } from "./state";

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 2_000;

/** Same registry npm itself would use, so the version check and the
 *  subsequent `npm install -g` agree — also what makes the update flow work
 *  behind a private registry mirror. */
function registryUrl(): string {
  const base = (
    process.env.npm_config_registry || "https://registry.npmjs.org"
  ).replace(/\/+$/, "");
  return `${base}/@openmail/cli/latest`;
}

/** True when `latest` is a strictly newer x.y.z than `current`. Prerelease
 *  suffixes are ignored — releases of this package are plain semver. */
export function isNewerVersion(latest: string, current: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, "")
      .split(".")
      .map((part) => Number.parseInt(part, 10));
  const [lMaj = 0, lMin = 0, lPat = 0] = parse(latest);
  const [cMaj = 0, cMin = 0, cPat = 0] = parse(current);
  if ([lMaj, lMin, lPat, cMaj, cMin, cPat].some((n) => !Number.isFinite(n))) {
    return false;
  }
  if (lMaj !== cMaj) return lMaj > cMaj;
  if (lMin !== cMin) return lMin > cMin;
  return lPat > cPat;
}

export async function fetchLatestVersion(
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<string | null> {
  try {
    const res = await fetch(registryUrl(), {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { version?: unknown };
    return typeof body.version === "string" ? body.version : null;
  } catch {
    return null;
  }
}

/**
 * Resolve the latest published version, hitting the npm registry at most once
 * per 24h; between checks the last-seen value is served from the state file.
 * Strictly best-effort: any failure resolves to null and costs at most the
 * fetch timeout.
 */
export async function getLatestVersionCached(
  statePath: string,
): Promise<string | null> {
  const state = await readCliState(statePath);
  const lastCheck = state.lastUpdateCheckAt
    ? Date.parse(state.lastUpdateCheckAt)
    : 0;
  if (
    Number.isFinite(lastCheck) &&
    Date.now() - lastCheck < CHECK_INTERVAL_MS
  ) {
    return state.latestKnownVersion ?? null;
  }

  const latest = await fetchLatestVersion();
  if (latest) {
    try {
      await writeCliState(statePath, {
        ...state,
        lastUpdateCheckAt: new Date().toISOString(),
        latestKnownVersion: latest,
      });
    } catch {
      // state write is best-effort; next run just re-checks
    }
  }
  return latest;
}

/**
 * Print a one-line upgrade nudge to stderr when a newer version is published.
 * Human output only — JSON consumers get exactly the payload they asked for.
 * The line names the exact command so an agent reading it can act on it.
 */
export async function notifyIfUpdateAvailable(
  ctx: CliContext,
  statePath: string,
  currentVersion: string,
): Promise<void> {
  if (ctx.output === "json") return;
  const latest = await getLatestVersionCached(statePath);
  if (!latest || !isNewerVersion(latest, currentVersion)) return;
  process.stderr.write(
    colorize(
      ctx,
      "yellow",
      `Update available: ${currentVersion} → ${latest}. Run: openmail update\n`,
    ),
  );
}
