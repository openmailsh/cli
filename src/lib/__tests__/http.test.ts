import { describe, it, expect, vi, afterEach } from "vitest";
import { ApiError, OpenMailHttpClient } from "../http";

const client = new OpenMailHttpClient({
  baseUrl: "https://api.test",
  apiKey: "key",
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenMailHttpClient error handling", () => {
  it("attaches rate-limit info from headers on a 429", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "rate_limit_exceeded", scope: "burst" }), {
          status: 429,
          headers: {
            "content-type": "application/json",
            "retry-after": "42",
            "x-ratelimit-limit": "10",
            "x-ratelimit-remaining": "0",
            "x-ratelimit-reset": "1780000000",
          },
        }),
      ),
    );

    const err = await client.get("/v1/inboxes").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(429);
    expect(err.rateLimit).toEqual({
      limit: 10,
      remaining: 0,
      reset: 1780000000,
      retryAfter: 42,
    });
  });

  it("leaves rateLimit undefined when no rate-limit headers are present", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: "not_found" }), {
          status: 404,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const err = await client.get("/v1/inboxes/x").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.rateLimit).toBeUndefined();
  });
});
