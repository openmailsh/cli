import WebSocket from "ws";
import fs from "node:fs/promises";
import { readFileSync, unlinkSync } from "node:fs";
import path from "node:path";
import type { CliContext } from "./output";
import { logError, logInfo } from "./output";
import { readBridgeState, writeBridgeState } from "./state";
import { OpenClawForwarder } from "./openclaw-forwarder";

const FATAL_CLOSE_CODES = new Set([
  4001, // unauthorized / API key revoked
  4003, // forbidden
  4008, // connection limit exceeded
]);

const MAX_RETRIES = 20;
const MIN_STABLE_CONNECTION_MS = 60_000;
const SHUTDOWN_GRACE_MS = 5_000;

type WsBridgeOptions = {
  baseUrl: string;
  apiKey: string;
  hookUrl: string;
  hookToken: string;
  statePath: string;
  inboxIds?: string[];
  eventTypes?: string[];
};

type ConnectResult = {
  fatal: boolean;
  reason?: string;
  connectedMs: number;
};

export async function runWsBridge(ctx: CliContext, options: WsBridgeOptions) {
  const lockPath = path.join(path.dirname(options.statePath), "bridge.lock");
  await acquirePidLock(lockPath);

  const state = await readBridgeState(options.statePath);
  const forwarder = new OpenClawForwarder({
    hookUrl: options.hookUrl,
    hookToken: options.hookToken,
  });
  const wsUrl = options.baseUrl
    .replace(/^http:\/\//, "ws://")
    .replace(/^https:\/\//, "wss://")
    .replace(/\/+$/, "");

  let retries = 0;
  let stopped = false;
  let activeWs: WebSocket | null = null;

  const shutdown = () => {
    stopped = true;
    if (activeWs) {
      try {
        activeWs.close();
      } catch {}
    }
    setTimeout(() => {
      releasePidLock(lockPath);
      process.exit(0);
    }, SHUTDOWN_GRACE_MS).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  try {
    while (!stopped) {
      if (retries > 0) {
        const delayMs = Math.min(1_000 * 2 ** retries, 30_000);
        logInfo(ctx, `Reconnecting in ${delayMs}ms (attempt ${retries}/${MAX_RETRIES})`);
        await sleep(delayMs);
        if (stopped) break;
      }

      try {
        const result = await connectOnce(
          ctx,
          `${wsUrl}/v1/ws`,
          options,
          state,
          forwarder,
          () => stopped,
          (ws) => {
            activeWs = ws;
          },
        );

        if (result.fatal) {
          logError(ctx, `Fatal: ${result.reason ?? "non-retryable server error"}. Exiting.`);
          break;
        }

        if (result.connectedMs >= MIN_STABLE_CONNECTION_MS) {
          retries = 0;
        } else {
          retries += 1;
        }
      } catch (err) {
        retries += 1;
        logError(ctx, `Bridge connection error: ${String(err)}`);
      }

      if (retries >= MAX_RETRIES) {
        logError(ctx, `Giving up after ${MAX_RETRIES} consecutive reconnect failures.`);
        break;
      }
    }
  } finally {
    releasePidLock(lockPath);
  }

  logInfo(ctx, "Bridge stopped");
}

async function connectOnce(
  ctx: CliContext,
  wsEndpoint: string,
  options: WsBridgeOptions,
  state: { lastEventId?: string },
  forwarder: OpenClawForwarder,
  isStopped: () => boolean,
  onWsCreated: (ws: WebSocket) => void,
): Promise<ConnectResult> {
  return new Promise<ConnectResult>((resolve, reject) => {
    const startedAt = Date.now();
    const ws = new WebSocket(wsEndpoint, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
    });

    onWsCreated(ws);

    let closed = false;
    const finish = (err?: Error, fatal = false, reason?: string) => {
      if (closed) return;
      closed = true;
      ws.removeAllListeners();
      try {
        ws.close();
      } catch {}
      const connectedMs = Date.now() - startedAt;
      if (err) {
        reject(err);
      } else {
        resolve({ fatal, reason, connectedMs });
      }
    };

    ws.on("open", () => {
      logInfo(ctx, "Connected to OpenMail websocket");
      const subscribe: Record<string, unknown> = { type: "subscribe" };
      if (options.inboxIds && options.inboxIds.length > 0) {
        subscribe.inbox_ids = options.inboxIds;
      }
      if (options.eventTypes && options.eventTypes.length > 0) {
        subscribe.event_types = options.eventTypes;
      }
      if (state.lastEventId) {
        subscribe.last_event_id = state.lastEventId;
      }
      ws.send(JSON.stringify(subscribe));
    });

    ws.on("message", async (raw: WebSocket.RawData) => {
      if (isStopped()) {
        finish();
        return;
      }
      const text = typeof raw === "string" ? raw : raw.toString();
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(text) as Record<string, unknown>;
      } catch {
        logError(ctx, "Received non-JSON message from websocket");
        return;
      }

      if (payload.type === "subscribed") {
        logInfo(ctx, "Subscription confirmed", payload);
        return;
      }
      if (payload.type === "error") {
        logError(ctx, "WebSocket server error", payload);
        return;
      }
      if (payload.type === "pong") {
        return;
      }
      if (payload.event !== "message.received") {
        logInfo(ctx, `Ignoring event type ${String(payload.event ?? "unknown")}`);
        return;
      }

      const result = await forwarder.forward(payload, ctx);
      if (!result.forwarded) {
        return;
      }
      const eventId = typeof payload.event_id === "string" ? payload.event_id : undefined;
      if (eventId) {
        state.lastEventId = eventId;
        await writeBridgeState(options.statePath, state);
      }
      logInfo(ctx, `Forwarded event ${eventId ?? "unknown"}`);
    });

    ws.on("close", (code, reason) => {
      const reasonStr = reason.toString();
      logInfo(ctx, `WebSocket closed (${code}) ${reasonStr}`);
      if (FATAL_CLOSE_CODES.has(code)) {
        finish(undefined, true, `${code} ${reasonStr}`);
      } else {
        finish();
      }
    });

    ws.on("error", (err) => {
      finish(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

async function acquirePidLock(lockPath: string): Promise<void> {
  await fs.mkdir(path.dirname(lockPath), { recursive: true });

  let existingPid: number | undefined;
  try {
    const content = await fs.readFile(lockPath, "utf8");
    existingPid = parseInt(content.trim(), 10);
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }

  if (
    existingPid !== undefined &&
    !isNaN(existingPid) &&
    existingPid !== process.pid &&
    isProcessAlive(existingPid)
  ) {
    throw new Error(
      `Another bridge instance is already running (pid ${existingPid}). ` +
        `Remove ${lockPath} if this is a stale lock.`,
    );
  }

  await fs.writeFile(lockPath, String(process.pid), "utf8");
}

function releasePidLock(lockPath: string): void {
  try {
    const content = readFileSync(lockPath, "utf8");
    if (parseInt(content.trim(), 10) === process.pid) {
      unlinkSync(lockPath);
    }
  } catch {
    // best-effort cleanup
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
