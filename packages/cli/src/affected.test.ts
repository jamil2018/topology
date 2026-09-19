import { describe, expect, it } from "vitest";

/** Mirrors packages/cli/src/index.ts path flag collection for unit coverage. */
function getFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function getFlags(args: string[], name: string): string[] {
  const values: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === name && args[i + 1] && !args[i + 1]!.startsWith("-")) {
      values.push(args[i + 1]!);
      i += 1;
    }
  }
  return values;
}

function collectAffectedPaths(args: string[]): string[] {
  const fromRepeated = getFlags(args, "--path");
  const csv = getFlag(args, "--paths");
  const fromCsv = csv
    ? csv
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [];
  return [...new Set([...fromRepeated, ...fromCsv])];
}

describe("cli affected path flags", () => {
  it("merges repeated --path and comma --paths", () => {
    expect(
      collectAffectedPaths([
        "--path",
        "src/a.ts",
        "--paths",
        "src/b.ts, src/c.ts",
        "--path",
        "src/a.ts",
      ]),
    ).toEqual(["src/a.ts", "src/b.ts", "src/c.ts"]);
  });

  it("returns empty when no path flags", () => {
    expect(collectAffectedPaths(["--rule", "src/=COMP"])).toEqual([]);
  });
});
