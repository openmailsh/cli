import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { refreshSkillFiles } from "../openclaw";

let homeDir: string;
let savedOpenclawHome: string | undefined;

beforeEach(async () => {
  homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "openmail-refresh-"));
  savedOpenclawHome = process.env.OPENCLAW_HOME;
  delete process.env.OPENCLAW_HOME;
});

afterEach(async () => {
  if (savedOpenclawHome !== undefined) {
    process.env.OPENCLAW_HOME = savedOpenclawHome;
  }
  await fs.rm(homeDir, { recursive: true, force: true });
});

describe("refreshSkillFiles", () => {
  it("reports not_installed when no skill files exist", async () => {
    const result = await refreshSkillFiles({ homeDir });
    expect(result.status).toBe("not_installed");
    expect(result.refreshed).toEqual([]);
    // It must not have created anything either.
    await expect(
      fs.access(path.join(homeDir, ".claude", "skills", "openmail")),
    ).rejects.toThrow();
  });

  it("rewrites an installed outdated skill file in place", async () => {
    const skillPath = path.join(
      homeDir,
      ".claude",
      "skills",
      "openmail",
      "SKILL.md",
    );
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(skillPath, "old template\n", "utf8");

    const result = await refreshSkillFiles({ homeDir });
    expect(result.status).toBe("refreshed");
    expect(result.refreshed).toEqual([skillPath]);
    const content = await fs.readFile(skillPath, "utf8");
    expect(content).toContain("# OpenMail");
    expect(content).toContain("openmail feedback");
  });

  it("is a no-op on a current skill file", async () => {
    const skillPath = path.join(
      homeDir,
      ".claude",
      "skills",
      "openmail",
      "SKILL.md",
    );
    await fs.mkdir(path.dirname(skillPath), { recursive: true });
    await fs.writeFile(skillPath, "stale\n", "utf8");
    await refreshSkillFiles({ homeDir });

    const second = await refreshSkillFiles({ homeDir });
    expect(second.status).toBe("unchanged");
    expect(second.refreshed).toEqual([]);
  });
});
