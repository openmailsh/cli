import { describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "../../lib/args";
import type { OpenMailHttpClient } from "../../lib/http";
import { readCliState } from "../../lib/state";
import { runInitCommand } from "../init";

const tmpStatePath = () =>
  path.join(
    os.tmpdir(),
    `openmail-cli-test-${process.pid}-${Math.random().toString(36).slice(2)}`,
    "state.json",
  );

function fakeClient() {
  const client = {
    async post(path: string) {
      if (path !== "/v1/inboxes") throw new Error(`unexpected POST ${path}`);
      return { id: "inb_1", address: "bob@example.openmail.sh" };
    },
  } as unknown as OpenMailHttpClient;
  return client;
}

describe("init", () => {
  it("saves the API key and the default inbox to the state file", async () => {
    const statePath = tmpStatePath();
    const result = await runInitCommand({
      client: fakeClient(),
      parsed: parseArgs(["init", "--mailbox-name", "bob"]),
      apiKey: "om_test_key",
      statePath,
      ctx: { output: "json", verbose: false },
    });

    expect(result).toEqual({
      inbox: { id: "inb_1", address: "bob@example.openmail.sh" },
      created: true,
      apiKeySaved: true,
    });
    const state = await readCliState(statePath);
    expect(state).toEqual({
      savedApiKey: "om_test_key",
      defaultInboxId: "inb_1",
      defaultInboxAddress: "bob@example.openmail.sh",
    });
    if (process.platform !== "win32") {
      const { mode } = await fs.stat(statePath);
      expect(mode & 0o777).toBe(0o600);
    }
    await fs.rm(path.dirname(statePath), { recursive: true, force: true });
  });
});
