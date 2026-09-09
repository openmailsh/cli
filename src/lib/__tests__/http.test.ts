import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, OpenMailHttpClient, describeHttpError } from "../http";

const client = () => new OpenMailHttpClient({ baseUrl: "https://api.openmail.sh", apiKey: "om_test" });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("describeHttpError", () => {
  it("labels JSON { error } bodies as OpenMail API errors", () => {
    expect(
      describeHttpError("https://api.openmail.sh/v1/inboxes", 403, {
        error: "forbidden",
        message: "nope",
      }),
    ).toBe("OpenMail API error (403)");
  });

  it("does not blame OpenMail for a plain-text proxy rejection", () => {
    const msg = describeHttpError(
      "https://api.openmail.sh/v1/inboxes",
      403,
      "Host not in allowlist: api.openmail.sh",
    );
    expect(msg).not.toContain("OpenMail API error");
    expect(msg).toContain("HTTP 403 from api.openmail.sh");
    expect(msg).toContain("proxy");
  });

  it("names the proxy when one is configured", () => {
    vi.stubEnv("HTTPS_PROXY", "http://gateway:3128");
    const msg = describeHttpError("https://api.openmail.sh/v1/inboxes", 403, "denied");
    expect(msg).toContain("via proxy http://gateway:3128");
  });
});

describe("OpenMailHttpClient errors", () => {
  it("throws ApiError with the API's own label for JSON errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ error: "unauthorized", message: "bad key" }), { status: 401 })),
    );
    const err = await client().get("/v1/inboxes").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toBe("OpenMail API error (401)");
    expect((err as ApiError).body).toEqual({ error: "unauthorized", message: "bad key" });
  });

  it("throws ApiError pointing at the network for non-API bodies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Host not in allowlist: api.openmail.sh", { status: 403 })),
    );
    const err = await client().get("/v1/inboxes").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(403);
    expect((err as ApiError).message).not.toContain("OpenMail API error");
    expect((err as ApiError).body).toBe("Host not in allowlist: api.openmail.sh");
  });

  it("bypasses the platform fetch when a proxy is configured", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:1"); // nothing listens here
    const platformFetch = vi.fn();
    vi.stubGlobal("fetch", platformFetch);
    // Routed through undici + EnvHttpProxyAgent; the connect fails, but the
    // point is that global fetch was never consulted and the error names the proxy.
    await expect(client().get("/v1/inboxes")).rejects.toThrow(/via proxy http:\/\/127\.0\.0\.1:1/);
    expect(platformFetch).not.toHaveBeenCalled();
  });
});
