import WebSocket from "ws";
import type { CliContext } from "./output";
import { logError, logInfo } from "./output";
import { readBridgeState, writeBridgeState } from "./state";
import { OpenClawForwarder } from "./openclaw-forwarder";

type WsBridgeOptions = {
  baseUrl: string;
  apiKey: string;
  hookUrl: string;
  hookToken: string;
  statePath: string;
  inboxIds?: string[];
  eventTypes?: string[];
};

export async function runWsBridge(ctx: CliContext, options: WsBridgeOptions) {
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
  const stop = () => {
    stopped = true;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (!stopped) {
    const delayMs = Math.min(1000 * Math.pow(2, retries), 30000);
    if (retries > 0) {
      logInfo(ctx, `Reconnecting in ${delayMs}ms`);
      await sleep(delayMs);
    }

    try {
      await connectOnce(ctx, `${wsUrl}/v1/ws`, options, state, forwarder, () => stopped);
      retries = 0;
    } catch (err) {
      retries += 1;
      logError(ctx, `Bridge connection error: ${String(err)}`);
    }
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
) {
  await new Promise<void>((resolve, reject) => {
    const ws = new WebSocket(wsEndpoint, {
      headers: {
        Authorization: `Bearer ${options.apiKey}`,
      },
    });

    let closed = false;
    const finish = (err?: Error) => {
      if (closed) return;
      closed = true;
      ws.removeAllListeners();
      ws.close();
      if (err) {
        reject(err);
      } else {
        resolve();
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
      logInfo(ctx, `WebSocket closed (${code}) ${reason.toString()}`);
      finish();
    });

    ws.on("error", (err) => {
      finish(err instanceof Error ? err : new Error(String(err)));
    });
  });
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}
