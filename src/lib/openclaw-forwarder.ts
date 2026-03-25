import type { CliContext } from "./output";
import { logInfo } from "./output";

const DEDUPE_MAX = 1000;

export class OpenClawForwarder {
  private readonly hookUrl: string;
  private readonly hookToken: string;
  private readonly dedupe = new Set<string>();
  private readonly order: string[] = [];

  constructor(params: { hookUrl: string; hookToken: string }) {
    this.hookUrl = params.hookUrl;
    this.hookToken = params.hookToken;
  }

  async forward(event: Record<string, unknown>, ctx: CliContext): Promise<{ forwarded: boolean }> {
    const eventId = typeof event.event_id === "string" ? event.event_id : "";
    if (eventId && this.dedupe.has(eventId)) {
      logInfo(ctx, `Skipping duplicate event ${eventId}`);
      return { forwarded: false };
    }

    // Rename "message" → "email" to avoid collision with OpenClaw's
    // reserved "message" field on the /hooks/agent action.
    const payload = reshapePayload(event);

    const response = await fetch(this.hookUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.hookToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`OpenClaw hook request failed (${response.status}): ${text}`);
    }

    if (eventId) {
      this.addDedupe(eventId);
    }
    return { forwarded: true };
  }

  private addDedupe(eventId: string) {
    if (this.dedupe.has(eventId)) {
      return;
    }
    this.dedupe.add(eventId);
    this.order.push(eventId);
    if (this.order.length > DEDUPE_MAX) {
      const oldest = this.order.shift();
      if (oldest) {
        this.dedupe.delete(oldest);
      }
    }
  }
}

function reshapePayload(event: Record<string, unknown>): Record<string, unknown> {
  if (!("message" in event)) return event;
  const { message, ...rest } = event;
  const msg = (message ?? {}) as Record<string, unknown>;
  const { from, ...msgRest } = msg;
  return { ...rest, email: { ...msgRest, sender: from } };
}
