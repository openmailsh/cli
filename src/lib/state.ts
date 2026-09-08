import fs from "node:fs/promises";
import path from "node:path";

export type CliState = {
  savedApiKey?: string;
  defaultInboxId?: string;
  defaultInboxAddress?: string;
  /** ISO timestamp of the last npm registry version check. */
  lastUpdateCheckAt?: string;
  /** Latest published version seen at that check. */
  latestKnownVersion?: string;
};

export async function readCliState(statePath: string): Promise<CliState> {
  try {
    const content = await fs.readFile(statePath, "utf8");
    const parsed = JSON.parse(content) as CliState;
    return parsed;
  } catch {
    return {};
  }
}

export async function writeCliState(statePath: string, state: CliState): Promise<void> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf8");
}
