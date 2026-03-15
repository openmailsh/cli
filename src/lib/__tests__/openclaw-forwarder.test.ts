import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenClawForwarder } from "../openclaw-forwarder";

describe("OpenClawForwarder", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards first event and skips duplicate event_id", async () => {
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const forwarder = new OpenClawForwarder({
      hookUrl: "http://127.0.0.1:18789/hooks/openmail",
      hookToken: "secret",
    });

    const ctx = { output: "human" as const, verbose: false };
    const event = { event: "message.received", event_id: "evt_1" };

    const first = await forwarder.forward(event, ctx);
    const second = await forwarder.forward(event, ctx);

    expect(first.forwarded).toBe(true);
    expect(second.forwarded).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
