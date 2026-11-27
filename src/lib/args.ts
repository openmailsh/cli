export type ParsedArgs = {
  argv: string[];
  command: string[];
  flags: Record<string, string | boolean>;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const command: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let i = 0;
  while (i < argv.length) {
    const token = argv[i];
    if (!token) {
      i += 1;
      continue;
    }
    if (!token.startsWith("--")) {
      command.push(token);
      i += 1;
      continue;
    }

    const withoutPrefix = token.slice(2);
    if (!withoutPrefix) {
      i += 1;
      continue;
    }
    const eqIdx = withoutPrefix.indexOf("=");
    if (eqIdx >= 0) {
      const key = withoutPrefix.slice(0, eqIdx);
      const value = withoutPrefix.slice(eqIdx + 1);
      flags[key] = value;
      i += 1;
      continue;
    }

    const key = withoutPrefix;
    const maybeValue = argv[i + 1];
    if (maybeValue !== undefined && !maybeValue.startsWith("--")) {
      flags[key] = maybeValue;
      i += 2;
      continue;
    }
    flags[key] = true;
    i += 1;
  }

  return { argv, command, flags };
}

export function getStringFlag(flags: Record<string, string | boolean>, key: string): string | undefined {
  const value = flags[key];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return undefined;
}

export function getBooleanFlag(flags: Record<string, string | boolean>, key: string): boolean {
  const value = flags[key];
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value === "true" || value === "1";
  }
  return false;
}

export function getNumberFlag(
  flags: Record<string, string | boolean>,
  key: string,
): number | undefined {
  const value = getStringFlag(flags, key);
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

/**
 * Collects all values for a repeated flag from an argv list.
 * e.g. `--attach a.pdf --attach b.pdf` → ["a.pdf", "b.pdf"]
 *
 * Defaults to `process.argv` (minus the node/script prefix) so callers can
 * keep passing nothing; pass an explicit argv to make it testable.
 */
export function getRepeatedStringFlag(
  key: string,
  argv: string[] = process.argv.slice(2),
): string[] {
  const flag = `--${key}`;
  const results: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === flag && argv[i + 1] && !argv[i + 1]!.startsWith("--")) {
      results.push(argv[i + 1]!);
      i++;
    } else if (argv[i]?.startsWith(`${flag}=`)) {
      results.push(argv[i]!.slice(flag.length + 1));
    }
  }
  return results;
}

/**
 * Counts how many times a flag appears in an argv list, in either form
 * (`--to x` or `--to=x`). Used to reject flags that must not be repeated,
 * e.g. `--subject`, or detect missing values for a repeated flag.
 */
export function countFlagOccurrences(
  key: string,
  argv: string[] = process.argv.slice(2),
): number {
  const flag = `--${key}`;
  let count = 0;
  for (const token of argv) {
    if (token === flag || token.startsWith(`${flag}=`)) {
      count += 1;
    }
  }
  return count;
}

/** Preserve a scalar for a single recipient and the entered order for a list. */
export function getToFlag(parsed: ParsedArgs): string | string[] | undefined {
  if (!("to" in parsed.flags)) return undefined;
  const values = getRepeatedStringFlag("to", parsed.argv);
  const addresses = values.flatMap(value => value.split(",").map(address => address.trim()));
  if (values.length !== countFlagOccurrences("to", parsed.argv) || addresses.some(address => !address)) {
    throw new Error("--to requires an email address for each recipient");
  }
  return addresses.length === 1 ? addresses[0] : addresses;
}

export function isTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value));
}

export function getSendAtFlag(parsed: ParsedArgs): string | undefined {
  if (!("send-at" in parsed.flags)) return undefined;
  const value = getStringFlag(parsed.flags, "send-at");
  if (!value || !isTimestamp(value) || countFlagOccurrences("send-at", parsed.argv) !== 1) {
    throw new Error("--send-at requires one ISO-8601 timestamp with timezone");
  }
  return value;
}
