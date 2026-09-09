import crypto from "node:crypto";
import { proxyAwareFetch, proxyFromEnv } from "./fetch";

export type HttpClientConfig = {
  baseUrl: string;
  apiKey: string;
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/**
 * The OpenMail API always answers errors as JSON `{ error, message }`. Anything
 * else (plain text, HTML) came from something in between — a proxy, sandbox
 * gateway, or captive portal — and must not be reported as an OpenMail error.
 */
export function describeHttpError(url: string, status: number, body: unknown): string {
  const isApiShape =
    typeof body === "object" && body !== null && typeof (body as { error?: unknown }).error === "string";
  if (isApiShape) {
    return `OpenMail API error (${status})`;
  }
  const host = safeHost(url);
  const proxy = proxyFromEnv();
  const via = proxy ? ` via proxy ${proxy}` : "";
  return `HTTP ${status} from ${host}${via} — not an OpenMail API response; check proxy/network egress`;
}

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

export class OpenMailHttpClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: HttpClientConfig) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
  }

  async get(path: string, query?: Record<string, string | number | undefined>) {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [key, value] of Object.entries(query)) {
        if (value === undefined) continue;
        url.searchParams.set(key, String(value));
      }
    }
    return this.request(url.toString(), { method: "GET" });
  }

  async post(path: string, body?: unknown, headers?: Record<string, string>) {
    return this.request(`${this.baseUrl}${path}`, {
      method: "POST",
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async patch(path: string, body?: unknown) {
    return this.request(`${this.baseUrl}${path}`, {
      method: "PATCH",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async put(path: string, body?: unknown) {
    return this.request(`${this.baseUrl}${path}`, {
      method: "PUT",
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }

  async delete(path: string) {
    return this.request(`${this.baseUrl}${path}`, { method: "DELETE" });
  }

  /** GET a binary response (attachments) as raw bytes. */
  async download(path: string): Promise<{ bytes: Buffer; contentType: string | null }> {
    const url = `${this.baseUrl}${path}`;
    const response = await proxyAwareFetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${this.apiKey}` },
    });
    if (!response.ok) {
      const text = await response.text();
      const body = tryParseJson(text) ?? text;
      throw new ApiError(describeHttpError(url, response.status, body), response.status, body);
    }
    return {
      bytes: Buffer.from(await response.arrayBuffer()),
      contentType: response.headers.get("content-type"),
    };
  }

  async sendEmail(params: {
    inboxId: string;
    to: string;
    cc?: string[];
    subject?: string;
    body: string;
    bodyHtml?: string;
    threadId?: string;
    includeQuote?: boolean;
    idempotencyKey?: string;
    replyTo?: string;
    attachments?: { path: string; filename: string; contentType: string }[];
  }) {
    const idempotencyKey = params.idempotencyKey ?? crypto.randomUUID();
    const url = `/v1/inboxes/${encodeURIComponent(params.inboxId)}/send`;

    if (params.attachments?.length) {
      const { readFile } = await import("node:fs/promises");
      const formData = new FormData();
      formData.append("to", params.to);
      if (params.subject) formData.append("subject", params.subject);
      formData.append("body", params.body);
      if (params.bodyHtml) formData.append("bodyHtml", params.bodyHtml);
      if (params.threadId) formData.append("threadId", params.threadId);
      if (params.includeQuote === false) {
        formData.append("includeQuote", "false");
      }
      if (params.replyTo) formData.append("replyTo", params.replyTo);
      for (const address of params.cc ?? []) {
        formData.append("cc", address);
      }

      for (const att of params.attachments) {
        const data = await readFile(att.path);
        const blob = new Blob([data], { type: att.contentType });
        formData.append("attachments", blob, att.filename);
      }

      return this.request(`${this.baseUrl}${url}`, {
        method: "POST",
        body: formData,
        headers: { "Idempotency-Key": idempotencyKey },
      });
    }

    const payload: Record<string, string | boolean | string[]> = {
      to: params.to,
      body: params.body,
    };
    if (params.subject) payload.subject = params.subject;
    if (params.cc?.length) payload.cc = params.cc;
    if (params.bodyHtml) payload.bodyHtml = params.bodyHtml;
    if (params.threadId) payload.threadId = params.threadId;
    if (params.includeQuote === false) payload.includeQuote = false;
    if (params.replyTo) payload.replyTo = params.replyTo;

    return this.post(url, payload, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const isFormData = init.body instanceof FormData;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...(init.body && !isFormData ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };

    const response = await proxyAwareFetch(url, {
      ...init,
      headers,
    });

    if (response.status === 204) {
      return { ok: true };
    }

    const text = await response.text();
    const parsedBody = tryParseJson(text);

    if (!response.ok) {
      const body = parsedBody ?? text;
      throw new ApiError(describeHttpError(url, response.status, body), response.status, body);
    }
    return parsedBody ?? text;
  }
}

function tryParseJson(input: string): unknown | null {
  if (!input.trim()) {
    return null;
  }
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
