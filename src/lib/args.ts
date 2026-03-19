export type ParsedArgs = {
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
    if (maybeValue && !maybeValue.startsWith("--")) {
      flags[key] = maybeValue;
      i += 2;
      continue;
    }
    flags[key] = true;
    i += 1;
  }

  return { command, flags };
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
 * Collects all values for a repeated flag from process.argv.
 * e.g. `--attach a.pdf --attach b.pdf` → ["a.pdf", "b.pdf"]
 */
export function getRepeatedStringFlag(key: string): string[] {
  const argv = process.argv.slice(2);
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
