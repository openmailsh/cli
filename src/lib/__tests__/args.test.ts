import { describe, expect, it } from "vitest";
import { getBooleanFlag, getNumberFlag, getStringFlag, parseArgs } from "../args";

describe("parseArgs", () => {
  it("parses command tokens and mixed flags", () => {
    const parsed = parseArgs([
      "inbox",
      "list",
      "--limit",
      "10",
      "--offset=5",
      "--json",
      "--api-key",
      "abc",
    ]);

    expect(parsed.command).toEqual(["inbox", "list"]);
    expect(parsed.flags).toEqual({
      limit: "10",
      offset: "5",
      json: true,
      "api-key": "abc",
    });
  });

  it("returns typed flag accessors", () => {
    const parsed = parseArgs(["doctor", "--json", "--limit", "20", "--base-url", "https://x"]);
    expect(getBooleanFlag(parsed.flags, "json")).toBe(true);
    expect(getNumberFlag(parsed.flags, "limit")).toBe(20);
    expect(getStringFlag(parsed.flags, "base-url")).toBe("https://x");
  });
});
