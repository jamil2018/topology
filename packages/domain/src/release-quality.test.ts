import { describe, expect, it } from "vitest";
import { computeReleaseQuality } from "./release-quality";

describe("computeReleaseQuality", () => {
  it("summarizes affected counts and execution tallies with rates", () => {
    const summary = computeReleaseQuality({
      affectedComponents: 3,
      affectedRequirements: 5,
      affectedIntents: 10,
      executed: 8,
      passed: 7,
      failed: 1,
      notExecuted: 2,
      gaps: [
        {
          kind: "never_executed",
          id: "i1",
          key: "PAY-1",
          title: "Refund retry",
          reason: "lacks failure-path coverage",
        },
      ],
    });

    expect(summary.affected).toEqual({
      components: 3,
      requirements: 5,
      intents: 10,
    });
    expect(summary.execution).toEqual({
      executed: 8,
      passed: 7,
      failed: 1,
      notExecuted: 2,
      passRate: 88,
      executedPct: 80,
    });
    expect(summary.gaps).toEqual([
      {
        kind: "never_executed",
        id: "i1",
        key: "PAY-1",
        title: "Refund retry",
        reason: "lacks failure-path coverage",
      },
    ]);
  });

  it("returns null rates when denominators are zero", () => {
    const summary = computeReleaseQuality({
      affectedComponents: 0,
      affectedRequirements: 0,
      affectedIntents: 0,
      executed: 0,
      passed: 0,
      failed: 0,
      notExecuted: 0,
      gaps: [],
    });
    expect(summary.execution.passRate).toBeNull();
    expect(summary.execution.executedPct).toBeNull();
    expect(summary.gaps).toEqual([]);
  });

  it("computes passRate from passed+failed only", () => {
    const summary = computeReleaseQuality({
      affectedComponents: 1,
      affectedRequirements: 1,
      affectedIntents: 4,
      executed: 2,
      passed: 1,
      failed: 1,
      notExecuted: 2,
      gaps: [],
    });
    expect(summary.execution.passRate).toBe(50);
    expect(summary.execution.executedPct).toBe(50);
  });

  it("copies gaps without mutating the input list", () => {
    const gaps = [
      { kind: "uncovered_requirement", id: "r1", key: "REQ-1", title: "X" },
    ];
    const summary = computeReleaseQuality({
      affectedComponents: 0,
      affectedRequirements: 1,
      affectedIntents: 0,
      executed: 0,
      passed: 0,
      failed: 0,
      notExecuted: 0,
      gaps,
    });
    expect(summary.gaps).toEqual(gaps);
    expect(summary.gaps).not.toBe(gaps);
    gaps[0].title = "mutated";
    expect(summary.gaps[0].title).toBe("X");
  });
});
