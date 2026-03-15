import crypto from "node:crypto";

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

  async delete(path: string) {
    return this.request(`${this.baseUrl}${path}`, { method: "DELETE" });
  }

  async sendEmail(params: {
    inboxId: string;
    to: string;
    subject: string;
    body: string;
    bodyHtml?: string;
    threadId?: string;
    idempotencyKey?: string;
  }) {
    const payload: Record<string, string> = {
      to: params.to,
      subject: params.subject,
      body: params.body,
    };
    if (params.bodyHtml) payload.bodyHtml = params.bodyHtml;
    if (params.threadId) payload.threadId = params.threadId;

    const idempotencyKey = params.idempotencyKey ?? crypto.randomUUID();
    return this.post(`/v1/inboxes/${encodeURIComponent(params.inboxId)}/send`, payload, {
      "Idempotency-Key": idempotencyKey,
    });
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers as Record<string, string> | undefined),
    };

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (response.status === 204) {
      return { ok: true };
    }

    const text = await response.text();
    const parsedBody = tryParseJson(text);

    if (!response.ok) {
      throw new ApiError(
        `OpenMail API error (${response.status})`,
        response.status,
        parsedBody ?? text,
      );
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
