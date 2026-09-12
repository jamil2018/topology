import { describe, expect, it } from "vitest";
import { computeQualityPulse } from "./pulse";
import { computeMilestoneReadiness, readinessBadgeLabel } from "./readiness";
import { buildTriageQueue } from "./triage";
import { detectFlakeSignal, flakeBadgeLabel } from "./flake";

describe("computeQualityPulse", () => {
  it("marks healthy when green", () => {
    const pulse = computeQualityPulse({
      cases: { total: 10, ready: 10, blocked: 0, draft: 0 },
      runs: { total: 2, inProgress: 0, completed: 2 },
      results: { passed: 20, failed: 0, untested: 0, total: 20 },
      triageOpen: 0,
      flakeSuspects: 0,
    });
    expect(pulse.health).toBe("healthy");
    expect(pulse.passRate).toBe(100);
  });

  it("escalates to critical on low pass rate", () => {
    const pulse = computeQualityPulse({
      cases: { total: 10, ready: 8, blocked: 2, draft: 0 },
      runs: { total: 2, inProgress: 1, completed: 1 },
      results: { passed: 5, failed: 10, untested: 0, total: 15 },
      triageOpen: 10,
    });
    expect(pulse.health).toBe("critical");
    expect(pulse.signals.length).toBeGreaterThan(0);
  });
});

describe("computeMilestoneReadiness", () => {
  it("returns ready when gates pass", () => {
    const result = computeMilestoneReadiness([
      {
        key: "TOP-1",
        priority: "P0",
        status: "ready",
        lastResult: "passed",
      },
      {
        key: "TOP-2",
        priority: "P1",
        status: "ready",
        lastResult: "passed",
      },
    ]);
    expect(result.status).toBe("ready");
    expect(readinessBadgeLabel(result.status)).toBe("Ready");
  });

  it("blocks on open P0 failures", () => {
    const result = computeMilestoneReadiness([
      {
        key: "TOP-1",
        priority: "P0",
        status: "ready",
        lastResult: "failed",
      },
    ]);
    expect(result.status).toBe("blocked");
    expect(result.openP0Failures).toBe(1);
  });
});

describe("buildTriageQueue", () => {
  it("ranks P0 and recurring failures first", () => {
    const queue = buildTriageQueue([
      {
        id: "1",
        caseKey: "TOP-9",
        caseTitle: "Low",
        priority: "P3",
        runId: "r1",
        runName: "ci",
        notes: "x",
        failedAt: new Date().toISOString(),
        occurrenceCount: 1,
      },
      {
        id: "2",
        caseKey: "TOP-1",
        caseTitle: "Critical",
        priority: "P0",
        runId: "r1",
        runName: "ci",
        notes: "boom",
        failedAt: new Date().toISOString(),
        occurrenceCount: 3,
      },
    ]);
    expect(queue[0]?.caseKey).toBe("TOP-1");
    expect(queue[0]?.urgency).toBe("immediate");
  });
});

describe("detectFlakeSignal", () => {
  it("flags alternating outcomes", () => {
    const signal = detectFlakeSignal([
      { status: "passed", at: "2026-01-01T00:00:00Z" },
      { status: "failed", at: "2026-01-02T00:00:00Z" },
      { status: "passed", at: "2026-01-03T00:00:00Z" },
      { status: "failed", at: "2026-01-04T00:00:00Z" },
      { status: "passed", at: "2026-01-05T00:00:00Z" },
    ]);
    expect(signal.isFlaky).toBe(true);
    expect(flakeBadgeLabel(signal)).toMatch(/flake/i);
  });

  it("does not flag consistent failures", () => {
    const signal = detectFlakeSignal([
      { status: "failed", at: "2026-01-01T00:00:00Z" },
      { status: "failed", at: "2026-01-02T00:00:00Z" },
      { status: "failed", at: "2026-01-03T00:00:00Z" },
      { status: "failed", at: "2026-01-04T00:00:00Z" },
    ]);
    expect(signal.isFlaky).toBe(false);
    expect(signal.hint).toMatch(/real defect/i);
  });
});
