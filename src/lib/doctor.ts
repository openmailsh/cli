import type { CliContext } from "./output";
import { logError, logInfo } from "./output";

export async function runDoctor(
  ctx: CliContext,
  params: {
    baseUrl: string;
    apiKey?: string;
    hookUrl?: string;
    hookToken?: string;
  },
) {
  const issues: string[] = [];

  if (!params.apiKey) {
    issues.push("OPENMAIL_API_KEY is missing");
  }
  if (params.hookUrl && !isValidUrl(params.hookUrl)) {
    issues.push("OPENCLAW_HOOK_URL is not a valid URL");
  }

  const healthResult = await probe(`${params.baseUrl}/health`, {});
  if (healthResult.ok) {
    logInfo(ctx, "OpenMail health check OK");
  } else {
    issues.push(`OpenMail health check failed: ${healthResult.message}`);
  }

  if (params.apiKey) {
    const inboxProbe = await probe(`${params.baseUrl}/v1/inboxes?limit=1`, {
      Authorization: `Bearer ${params.apiKey}`,
    });
    if (inboxProbe.ok) {
      logInfo(ctx, "OpenMail auth check OK");
    } else {
      issues.push(`OpenMail auth check failed: ${inboxProbe.message}`);
    }
  }

  if (params.hookUrl && params.hookToken) {
    logInfo(
      ctx,
      "OpenClaw hook configured. To verify manually, POST a test event to the hook URL with the hook token.",
    );
  } else {
    logInfo(
      ctx,
      "OpenClaw hook variables are not fully configured (OPENCLAW_HOOK_URL/OPENCLAW_HOOK_TOKEN).",
    );
  }

  if (issues.length > 0) {
    for (const issue of issues) {
      logError(ctx, issue);
    }
    throw new Error(`doctor found ${issues.length} issue(s)`);
  }
  logInfo(ctx, "Doctor checks passed");
}

async function probe(url: string, headers: Record<string, string>) {
  try {
    const res = await fetch(url, { method: "GET", headers });
    if (!res.ok) {
      return { ok: false, message: `HTTP ${res.status}` };
    }
    return { ok: true, message: "ok" };
  } catch (err) {
    return { ok: false, message: String(err) };
  }
}

function isValidUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
