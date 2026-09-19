import { describe, expect, it } from "vitest";
import { compareReleases, type ReleaseSnapshot } from "./compare-releases";

const dim = (
  covered: number,
  total: number,
  pct: number | null,
): ReleaseSnapshot["requirement"] => ({ covered, total, pct });

describe("compareReleases", () => {
  it("computes coverage and count deltas from before → after", () => {
    const before: ReleaseSnapshot = {
      requirement: dim(4, 5, 80),
      risk: dim(2, 2, 100),
      automation: dim(6, 10, 60),
      execution: dim(8, 10, 80),
      flakeCount: 5,
      unverifiedChanges: 3,
    };
    const after: ReleaseSnapshot = {
      requirement: dim(5, 5, 100),
      risk: dim(2, 3, 67),
      automation: dim(7, 10, 70),
      execution: dim(9, 10, 90),
      flakeCount: 2,
      unverifiedChanges: 1,
    };

    const cmp = compareReleases(before, after);

    expect(cmp.requirement).toEqual({
      before: dim(4, 5, 80),
      after: dim(5, 5, 100),
      coveredDelta: 1,
      totalDelta: 0,
      pctDelta: 20,
    });
    expect(cmp.risk.pctDelta).toBe(-33);
    expect(cmp.risk.totalDelta).toBe(1);
    expect(cmp.automation.coveredDelta).toBe(1);
    expect(cmp.execution.pctDelta).toBe(10);
    expect(cmp.flakeCount).toEqual({ before: 5, after: 2, delta: -3 });
    expect(cmp.unverifiedChanges).toEqual({
      before: 3,
      after: 1,
      delta: -2,
    });
  });

  it("returns null pctDelta when either side is N/A", () => {
    const before: ReleaseSnapshot = {
      requirement: dim(0, 0, null),
      risk: dim(0, 0, null),
      automation: dim(0, 1, 0),
      execution: dim(0, 1, 0),
      flakeCount: 0,
      unverifiedChanges: 0,
    };
    const after: ReleaseSnapshot = {
      requirement: dim(1, 2, 50),
      risk: dim(0, 0, null),
      automation: dim(1, 1, 100),
      execution: dim(1, 1, 100),
      flakeCount: 1,
      unverifiedChanges: 2,
    };

    const cmp = compareReleases(before, after);
    expect(cmp.requirement.pctDelta).toBeNull();
    expect(cmp.requirement.coveredDelta).toBe(1);
    expect(cmp.risk.pctDelta).toBeNull();
    expect(cmp.automation.pctDelta).toBe(100);
    expect(cmp.flakeCount.delta).toBe(1);
    expect(cmp.unverifiedChanges.delta).toBe(2);
  });
});
