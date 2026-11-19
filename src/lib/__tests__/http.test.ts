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
  it("reads the original UTF-8 filename from an attachment response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("file", {
      headers: { "Content-Disposition": "attachment; filename=\"s_skaita.pdf\"; filename*=UTF-8''s%C4%85skaita.pdf" },
    })));
    expect((await client().download("/v1/attachments/msg/id")).filename).toBe("sąskaita.pdf");
  });

  it("identifies itself to the API on every request", async () => {
    const fetchMock = vi.fn(async () => new Response("[]", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await client().get("/v1/inboxes");
    const headers = (fetchMock.mock.calls[0] as unknown[])[1] as { headers: Record<string, string> };
    expect(headers.headers["X-OpenMail-Client"]).toBe("cli");
    expect(headers.headers["User-Agent"]).toMatch(/^openmail-cli\/\d+\.\d+\.\d+/);
  });

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

  it("uses the proxy dispatcher and preserves the multipart encoding for attachments", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:1");
    const fetchMock = vi.fn(async (url: string, init: RequestInit & { dispatcher?: unknown }) => {
      expect(init.dispatcher).toBeDefined();
      const request = new Request(url, init);
      expect(request.headers.get("Content-Type")).toMatch(/^multipart\/form-data; boundary=/);
      const form = await request.formData();
      expect(form.get("inboxId")).toBe("inbox-1");
      expect(await (form.get("attachments") as File).text()).toBe("draft attachment");
      return new Response("{}");
    });
    vi.stubGlobal("fetch", fetchMock);
    const form = new FormData();
    form.append("inboxId", "inbox-1");
    form.append("attachments", new Blob(["draft attachment"]), "notes.txt");
    await client().post("/v1/drafts", form);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("identifies the proxy when connecting fails", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://127.0.0.1:1");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fetch failed")));
    await expect(client().get("/v1/inboxes")).rejects.toThrow(/via proxy http:\/\/127\.0\.0\.1:1/);
  });
});
