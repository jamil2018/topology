import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyMapping } from "./mapping";
import { parseXray } from "./xray";

const fixture = (name: string) =>
  readFileSync(path.join(process.cwd(), "fixtures/import", name), "utf8");

describe("parseXray", () => {
  it("groups CSV rows that share an issue key", () => {
    const parsed = parseXray(fixture("xray.csv"));
    const { rows, errors } = applyMapping(parsed.table, parsed.suggestedMapping);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      key: "CALC-1",
      title: "Add two numbers",
      folder: "Calculator",
      priority: "P1",
      tags: "math;smoke",
    });
    expect(rows[0]?.steps.split("\n")).toHaveLength(3);
    expect(rows[0]?.expectedResult).toContain("Result is 5");
    expect(rows[1]?.key).toBe("CALC-2");
  });

  it("parses an Xray tests JSON export", () => {
    const parsed = parseXray(fixture("xray.json"));
    const { rows } = applyMapping(parsed.table, parsed.suggestedMapping);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "CALC-9",
      title: "Clear the tape",
      folder: "Calculator / History",
      priority: "P3",
      preconditions: "Tape has entries",
    });
    expect(rows[0]?.steps).toContain("Click Clear");
  });
});
