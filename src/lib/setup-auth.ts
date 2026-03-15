import { spawn } from "node:child_process";
import { cancel, isCancel, note, spinner, text } from "@clack/prompts";
import type { CliContext } from "./output";
import { clearScreen, logInfo } from "./output";
import { OpenMailHttpClient } from "./http";
import { readCliState, writeCliState } from "./state";

export async function resolveApiKeyForSetup(params: {
  ctx: CliContext;
  baseUrl: string;
  statePath: string;
  initialApiKey?: string;
}): Promise<string> {
  const state = await readCliState(params.statePath);
  const candidates = [params.initialApiKey, state.savedApiKey].filter(
    (value): value is string => Boolean(value?.trim()),
  );

  for (const key of candidates) {
    if (await isValidApiKey(params.baseUrl, key)) {
      if (state.savedApiKey !== key) {
        state.savedApiKey = key;
        await writeCliState(params.statePath, state);
      }
      return key;
    }
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      "no valid API key found. Set OPENMAIL_API_KEY/--api-key or run in interactive mode.",
    );
  }

  const started = await startCliAuth(params.baseUrl);
  if (started) {
    // Print raw URL on its own line so users can copy it reliably.
    logInfo(params.ctx, `\nOpen this URL in browser: ${started.verifyUrl}`);
    note(`One-time code: ${started.userCode}`, "Authorize OpenMail CLI");
    const opened = openBrowser(started.verifyUrl);
    if (!opened) {
      logInfo(params.ctx, "Could not auto-open browser. Open the URL manually.");
    }

    const waitSpinner = spinner();
    waitSpinner.start("Waiting for browser approval...");
    const automatic = await pollCliAuth(
      params.baseUrl,
      started.requestId,
      started.expiresInSeconds,
    );
    if (automatic) {
      waitSpinner.stop("Authorization completed.");
      state.savedApiKey = automatic;
      await writeCliState(params.statePath, state);
      clearScreen(params.ctx);
      return automatic;
    }
    waitSpinner.stop("Automatic pairing timed out.");
  } else {
    const loginUrl = "https://console.openmail.sh/login";
    logInfo(params.ctx, `No valid API key found. Login URL: ${loginUrl}`);
    const opened = openBrowser(loginUrl);
    if (!opened) {
      logInfo(params.ctx, "Could not auto-open browser. Open the login URL manually.");
    }
  }

  note("Sign in, copy API key from Settings, then paste it below.", "Manual API key");
  for (;;) {
    const entered = await text({
      message: "OpenMail API key",
      placeholder: "om_...",
      validate(value) {
        return typeof value === "string" && value.trim().length > 0
          ? undefined
          : "API key is required";
      },
    });
    if (isCancel(entered)) {
      cancel("Setup cancelled.");
      throw new Error("setup cancelled");
    }
    const key = entered.trim();
    if (await isValidApiKey(params.baseUrl, key)) {
      state.savedApiKey = key;
      await writeCliState(params.statePath, state);
      clearScreen(params.ctx);
      return key;
    }
    note("API key check failed. Try again.", "Invalid key");
  }
}

async function isValidApiKey(baseUrl: string, apiKey: string): Promise<boolean> {
  try {
    const client = new OpenMailHttpClient({ baseUrl, apiKey });
    await client.get("/v1/inboxes", { limit: 1, offset: 0 });
    return true;
  } catch {
    return false;
  }
}

async function startCliAuth(
  baseUrl: string,
): Promise<{
  requestId: string;
  userCode: string;
  verifyUrl: string;
  expiresInSeconds: number;
} | null> {
  const response = await fetch(`${baseUrl}/auth/cli/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to start CLI auth (${response.status}): ${text}`);
  }
  const data = (await response.json()) as {
    requestId: string;
    userCode: string;
    verifyUrl: string;
    expiresInSeconds: number;
  };
  return data;
}

async function pollCliAuth(
  baseUrl: string,
  requestId: string,
  expiresInSeconds: number,
): Promise<string | null> {
  const deadline = Date.now() + expiresInSeconds * 1000;
  while (Date.now() < deadline) {
    await sleep(2000);
    const response = await fetch(
      `${baseUrl}/auth/cli/poll?requestId=${encodeURIComponent(requestId)}`,
      { method: "GET" },
    );
    if (response.status === 202) {
      continue;
    }
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      continue;
    }
    const data = (await response.json()) as { status?: string; apiKey?: string };
    if (data.status === "ready" && typeof data.apiKey === "string" && data.apiKey) {
      return data.apiKey;
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function openBrowser(url: string): boolean {
  const command =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args =
    process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = spawn(command, args, {
      detached: true,
      stdio: "ignore",
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
