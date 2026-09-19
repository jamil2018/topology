import { describe, expect, it } from "vitest";
import {
  buildReleaseQualityInputFromParts,
  isReleaseQualityInput,
  isReleaseSnapshot,
  mapCoverageGapsToReleaseGaps,
  parseAnalyzeBody,
  parseCompareBody,
  tallyIntentOutcomes,
  compareReleaseSnapshots,
} from "./release-quality";

describe("mapCoverageGapsToReleaseGaps", () => {
  it("adds default reasons by kind", () => {
    expect(
      mapCoverageGapsToReleaseGaps([
        {
          kind: "never_executed",
          id: "i1",
          key: "AUTH-1",
          title: "Login",
        },
        {
          kind: "manual_only_p0",
          id: "i2",
          key: "PAY-1",
          title: "Refund",
          reason: "custom",
        },
      ]),
    ).toEqual([
      {
        kind: "never_executed",
        id: "i1",
        key: "AUTH-1",
        title: "Login",
        reason: "never executed in workspace",
      },
      {
        kind: "manual_only_p0",
        id: "i2",
        key: "PAY-1",
        title: "Refund",
        reason: "custom",
      },
    ]);
  });
});

describe("tallyIntentOutcomes", () => {
  it("collapses results per intent with failed winning", () => {
    const tallies = tallyIntentOutcomes([
      { intentId: "a", status: "passed" },
      { intentId: "a", status: "failed" },
      { intentId: "b", status: "passed" },
      { intentId: "c", status: "skipped" },
    ]);
    expect(tallies).toEqual({ passed: 1, failed: 1, executed: 2 });
  });
});

describe("buildReleaseQualityInputFromParts", () => {
  it("derives executed and notExecuted from tallies and intent total", () => {
    const input = buildReleaseQualityInputFromParts({
      componentCount: 2,
      requirementTotal: 5,
      intentTotal: 10,
      passed: 6,
      failed: 1,
      gaps: [
        {
          kind: "uncovered_requirement",
          id: "r1",
          key: "REQ-1",
          title: "Checkout",
        },
      ],
    });
    expect(input).toMatchObject({
      affectedComponents: 2,
      affectedRequirements: 5,
      affectedIntents: 10,
      executed: 7,
      passed: 6,
      failed: 1,
      notExecuted: 3,
    });
    expect(input.gaps[0]?.reason).toBe("no linked test intent");
  });
});

describe("parseAnalyzeBody", () => {
  it("treats empty / workspace mode as workspace", () => {
    expect(parseAnalyzeBody(null)).toEqual({ ok: true, mode: "workspace" });
    expect(parseAnalyzeBody({})).toEqual({ ok: true, mode: "workspace" });
    expect(parseAnalyzeBody({ mode: "workspace" })).toEqual({
      ok: true,
      mode: "workspace",
    });
  });

  it("accepts a full precomputed input", () => {
    const input = {
      affectedComponents: 1,
      affectedRequirements: 2,
      affectedIntents: 3,
      executed: 2,
      passed: 2,
      failed: 0,
      notExecuted: 1,
      gaps: [],
    };
    expect(isReleaseQualityInput(input)).toBe(true);
    expect(parseAnalyzeBody(input)).toEqual({
      ok: true,
      mode: "precomputed",
      input,
    });
  });

  it("rejects partial bodies", () => {
    const result = parseAnalyzeBody({ affectedIntents: 3 });
    expect(result.ok).toBe(false);
  });
});

describe("parseCompareBody / compareReleaseSnapshots", () => {
  const dim = (covered: number, total: number, pct: number | null) => ({
    covered,
    total,
    pct,
  });
  const snap = {
    requirement: dim(1, 2, 50),
    risk: dim(0, 0, null),
    automation: dim(1, 1, 100),
    execution: dim(1, 2, 50),
    flakeCount: 2,
    unverifiedChanges: 1,
  };

  it("validates snapshots and returns comparison", async () => {
    expect(isReleaseSnapshot(snap)).toBe(true);
    const parsed = parseCompareBody({
      before: snap,
      after: { ...snap, flakeCount: 0, unverifiedChanges: 0 },
    });
    expect(parsed.ok).toBe(true);

    const result = await compareReleaseSnapshots("ws", {
      before: snap,
      after: {
        ...snap,
        requirement: dim(2, 2, 100),
        flakeCount: 0,
        unverifiedChanges: 0,
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.comparison.requirement.pctDelta).toBe(50);
    expect(result.comparison.flakeCount.delta).toBe(-2);
  });

  it("rejects missing snapshots", async () => {
    expect(parseCompareBody({ before: snap }).ok).toBe(false);
    expect((await compareReleaseSnapshots("ws", {})).ok).toBe(false);
  });
});
