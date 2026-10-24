import { describe, expect, it } from "vitest";
import { flakeHintsFromHistoryRows } from "./flake";

describe("flakeHintsFromHistoryRows", () => {
  it("batches per-case history in one pass instead of per-id queries", () => {
    const t = (n: number) => new Date(`2026-01-0${n}T00:00:00.000Z`);
    const rows = [
      { caseId: "a", status: "passed", at: t(1) },
      { caseId: "a", status: "failed", at: t(2) },
      { caseId: "a", status: "passed", at: t(3) },
      { caseId: "a", status: "failed", at: t(4) },
      { caseId: "a", status: "passed", at: t(5) },
      { caseId: "b", status: "passed", at: t(1) },
      { caseId: "b", status: "passed", at: t(2) },
      { caseId: "b", status: "passed", at: t(3) },
      { caseId: "b", status: "passed", at: t(4) },
    ];

    const map = flakeHintsFromHistoryRows(rows);
    expect(map.size).toBe(2);
    expect(map.get("a")?.isFlaky).toBe(true);
    expect(map.get("b")?.isFlaky).toBe(false);
  });

  it("ignores empty input and non-decisive statuses", () => {
    expect(flakeHintsFromHistoryRows([]).size).toBe(0);
    const map = flakeHintsFromHistoryRows([
      { caseId: "a", status: "skipped", at: new Date() },
      { caseId: "", status: "failed", at: new Date() },
    ]);
    expect(map.size).toBe(0);
  });
});
