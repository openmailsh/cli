export type OutputMode = "human" | "json";

export type CliContext = {
  output: OutputMode;
  verbose: boolean;
};

export function supportsAnsi(ctx: CliContext): boolean {
  return ctx.output === "human" && Boolean(process.stdout.isTTY);
}

export function clearScreen(ctx: CliContext) {
  if (!supportsAnsi(ctx)) {
    return;
  }
  process.stdout.write("\x1b[2J\x1b[H");
}

export function colorize(
  ctx: CliContext,
  color: "green" | "yellow" | "cyan" | "red" | "gray",
  text: string,
): string {
  if (!supportsAnsi(ctx)) {
    return text;
  }
  const codes: Record<typeof color, string> = {
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    cyan: "\x1b[36m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
  };
  return `${codes[color]}${text}\x1b[0m`;
}

export function logInfo(ctx: CliContext, message: string, payload?: unknown) {
  if (ctx.output === "json") {
    const body: Record<string, unknown> = { level: "info", message };
    if (payload !== undefined) {
      body.payload = payload;
    }
    process.stdout.write(`${JSON.stringify(body)}\n`);
    return;
  }
  process.stdout.write(`${message}\n`);
  if (payload !== undefined && ctx.verbose) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  }
}

export function logError(ctx: CliContext, message: string, payload?: unknown) {
  if (ctx.output === "json") {
    const body: Record<string, unknown> = { level: "error", message };
    if (payload !== undefined) {
      body.payload = payload;
    }
    process.stderr.write(`${JSON.stringify(body)}\n`);
    return;
  }
  process.stderr.write(`${message}\n`);
  if (payload !== undefined && ctx.verbose) {
    process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  }
}

export function printData(ctx: CliContext, data: unknown) {
  if (ctx.output === "json") {
    process.stdout.write(`${JSON.stringify(data)}\n`);
    return;
  }

  if (isListPayload(data)) {
    const count = data.data.length;
    const total = typeof data.total === "number" ? data.total : count;
    process.stdout.write(`Found ${count} item(s)${total !== count ? ` (${total} total)` : ""}\n`);
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }

  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

function isListPayload(data: unknown): data is { data: unknown[]; total?: number } {
  if (!data || typeof data !== "object") {
    return false;
  }
  const record = data as Record<string, unknown>;
  return Array.isArray(record.data);
}
