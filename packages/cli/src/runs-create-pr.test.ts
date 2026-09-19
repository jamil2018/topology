import { describe, expect, it } from "vitest";

/**
 * Mirrors packages/cli/src/index.ts --pr parsing for runs create.
 * Kept local so CLI packaging stays free of a separate parse module.
 */
function parsePrFlag(args: string[]): number | undefined {
  const idx = args.indexOf("--pr");
  if (idx === -1) return undefined;
  const raw = args[idx + 1];
  if (raw == null || raw.startsWith("-")) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) {
    throw new Error(`Invalid --pr ${raw}`);
  }
  return n;
}

describe("cli runs create --pr", () => {
  it("parses a positive integer PR number", () => {
    expect(parsePrFlag(["--name", "ci", "--pr", "843", "--sha", "abc"])).toBe(
      843,
    );
  });

  it("returns undefined when --pr is omitted", () => {
    expect(parsePrFlag(["--name", "ci", "--sha", "abc"])).toBeUndefined();
  });

  it("rejects non-positive values", () => {
    expect(() => parsePrFlag(["--pr", "0"])).toThrow(/Invalid --pr/);
    expect(() => parsePrFlag(["--pr", "nope"])).toThrow(/Invalid --pr/);
  });
});
