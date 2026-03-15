import fs from "node:fs/promises";
import path from "node:path";

export type CliState = {
  savedApiKey?: string;
  lastEventId?: string;
  defaultInboxId?: string;
  defaultInboxAddress?: string;
  defaultSetupMode?: "websocket" | "webhook";
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

export async function readBridgeState(statePath: string): Promise<CliState> {
  return readCliState(statePath);
}

export async function writeBridgeState(statePath: string, state: CliState): Promise<void> {
  return writeCliState(statePath, state);
}
