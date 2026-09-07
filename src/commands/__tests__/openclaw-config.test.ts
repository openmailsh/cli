import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mergeSkillIntoOpenClawConfig } from "../openclaw";

let openclawHome: string;
const env = { OPENMAIL_API_KEY: "om_test", OPENMAIL_INBOX_ID: "inb_1" };

async function readConfig() {
  const raw = await fs.readFile(path.join(openclawHome, "openclaw.json"), "utf8");
  return JSON.parse(raw) as {
    hooks?: { enabled?: boolean; token?: string; mappings?: unknown[] };
    skills?: { entries?: { openmail?: { enabled?: boolean } } };
  };
}

beforeEach(async () => {
  openclawHome = await fs.mkdtemp(path.join(os.tmpdir(), "openmail-merge-"));
});

afterEach(async () => {
  await fs.rm(openclawHome, { recursive: true, force: true });
});

describe("mergeSkillIntoOpenClawConfig", () => {
  it("enables hooks and mints a token on a fresh config when a bridge is needed", async () => {
    const result = await mergeSkillIntoOpenClawConfig(openclawHome, env, {
      registerHookMapping: true,
    });
    expect(result.changed).toBe(true);
    expect(result.hooksEnabled).toBe(true);
    expect(result.hookToken).toMatch(/^[0-9a-f]{48}$/);

    const config = await readConfig();
    expect(config.hooks?.enabled).toBe(true);
    expect(config.hooks?.token).toBe(result.hookToken);
    expect(config.hooks?.mappings).toHaveLength(1);
    expect(config.skills?.entries?.openmail?.enabled).toBe(true);
  });

  it("keeps an existing hooks.token and does not report hooks as newly enabled", async () => {
    await fs.writeFile(
      path.join(openclawHome, "openclaw.json"),
      JSON.stringify({ hooks: { enabled: true, token: "user-token" } }),
    );
    const result = await mergeSkillIntoOpenClawConfig(openclawHome, env, {
      registerHookMapping: true,
      hookToken: "flag-token-should-lose",
    });
    expect(result.hookToken).toBe("user-token");
    expect(result.hooksEnabled).toBe(false);
    const config = await readConfig();
    expect(config.hooks?.token).toBe("user-token");
  });

  it("uses the token passed in when the config has none", async () => {
    const result = await mergeSkillIntoOpenClawConfig(openclawHome, env, {
      registerHookMapping: true,
      hookToken: "from-flag",
    });
    expect(result.hookToken).toBe("from-flag");
    expect((await readConfig()).hooks?.token).toBe("from-flag");
  });

  it("leaves hooks untouched in tool mode", async () => {
    const result = await mergeSkillIntoOpenClawConfig(openclawHome, env, {
      registerHookMapping: false,
    });
    expect(result.hookToken).toBeUndefined();
    expect(result.hooksEnabled).toBe(false);
    expect((await readConfig()).hooks).toBeUndefined();
  });

  it("writes a mode-specific hook message template", async () => {
    await mergeSkillIntoOpenClawConfig(openclawHome, env, {
      registerHookMapping: true,
      usageMode: "channel",
    });
    const mapping = (await readConfig()).hooks?.mappings?.[0] as { messageTemplate: string };
    expect(mapping.messageTemplate).toContain("channel mode");
    expect(mapping.messageTemplate).toContain("{{thread_id}}");
    expect(mapping.messageTemplate).toContain("{{email.body_text}}");

    await mergeSkillIntoOpenClawConfig(openclawHome, env, {
      registerHookMapping: true,
      usageMode: "notify",
    });
    const notify = (await readConfig()).hooks?.mappings?.[0] as { messageTemplate: string };
    expect(notify.messageTemplate).toContain("notify mode");
    expect((await readConfig()).hooks?.mappings).toHaveLength(1);
  });

  it("preserves user-set delivery fields on the existing mapping", async () => {
    await mergeSkillIntoOpenClawConfig(openclawHome, env, { registerHookMapping: true });
    const configPath = path.join(openclawHome, "openclaw.json");
    const config = JSON.parse(await fs.readFile(configPath, "utf8"));
    Object.assign(config.hooks.mappings[0], { channel: "whatsapp", to: "+123", deliver: true });
    await fs.writeFile(configPath, JSON.stringify(config));

    await mergeSkillIntoOpenClawConfig(openclawHome, env, {
      registerHookMapping: true,
      usageMode: "channel",
    });
    const mapping = (await readConfig()).hooks?.mappings?.[0] as Record<string, unknown>;
    expect(mapping.channel).toBe("whatsapp");
    expect(mapping.to).toBe("+123");
    expect(mapping.deliver).toBe(true);
    expect(String(mapping.messageTemplate)).toContain("channel mode");
  });

  it("is idempotent on a second run", async () => {
    await mergeSkillIntoOpenClawConfig(openclawHome, env, { registerHookMapping: true });
    const second = await mergeSkillIntoOpenClawConfig(openclawHome, env, {
      registerHookMapping: true,
    });
    expect(second.changed).toBe(false);
    expect(second.hooksEnabled).toBe(false);
  });
});
