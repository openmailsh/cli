import { describe, expect, it } from "vitest";
import {
  countFlagOccurrences,
  getBooleanFlag,
  getNumberFlag,
  getRepeatedStringFlag,
  getStringFlag,
  parseArgs,
} from "../args";

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

describe("countFlagOccurrences", () => {
  it("counts space- and equals-separated occurrences", () => {
    const argv = ["send", "--to", "a@x.com", "--to=b@x.com", "--cc", "c@x.com"];
    expect(countFlagOccurrences("to", argv)).toBe(2);
    expect(countFlagOccurrences("cc", argv)).toBe(1);
    expect(countFlagOccurrences("bcc", argv)).toBe(0);
  });
});

describe("getRepeatedStringFlag", () => {
  it("collects all values from an explicit argv", () => {
    const argv = ["send", "--cc", "a@x.com", "--cc=b@x.com", "--to", "c@x.com"];
    expect(getRepeatedStringFlag("cc", argv)).toEqual(["a@x.com", "b@x.com"]);
  });
});
