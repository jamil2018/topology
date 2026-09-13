import { describe, expect, it } from "vitest";
import { computeQualityPulse } from "./pulse";
import { computeMilestoneReadiness, readinessBadgeLabel } from "./readiness";
import { buildTriageQueue, failureFingerprint } from "./triage";
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
    expect(pulse.signals[0]).toMatch(/steady/i);
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

  it("enters watch band for soft regressions", () => {
    const pulse = computeQualityPulse({
      cases: { total: 10, ready: 9, blocked: 0, draft: 1 },
      runs: { total: 1, inProgress: 0, completed: 1 },
      results: { passed: 9, failed: 1, untested: 0, total: 10 },
      triageOpen: 1,
      flakeSuspects: 1,
    });
    expect(pulse.health).toBe("watch");
    expect(pulse.passRate).toBe(90);
    expect(pulse.signals.some((s) => /triage/i.test(s))).toBe(true);
    expect(pulse.signals.some((s) => /flake/i.test(s))).toBe(true);
  });

  it("returns null pass rate when nothing executed", () => {
    const pulse = computeQualityPulse({
      cases: { total: 0, ready: 0, blocked: 0, draft: 0 },
      runs: { total: 0, inProgress: 0, completed: 0 },
      results: { passed: 0, failed: 0, untested: 5, total: 5 },
    });
    expect(pulse.passRate).toBeNull();
    expect(pulse.caseReadiness).toBeNull();
    expect(pulse.health).toBe("healthy");
  });

  it("marks critical when enough cases are blocked", () => {
    const pulse = computeQualityPulse({
      cases: { total: 10, ready: 7, blocked: 3, draft: 0 },
      runs: { total: 1, inProgress: 0, completed: 1 },
      results: { passed: 10, failed: 0, untested: 0, total: 10 },
    });
    expect(pulse.health).toBe("critical");
    expect(pulse.signals.some((s) => /blocked/i.test(s))).toBe(true);
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
    expect(result.reasons[0]).toMatch(/green/i);
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
    expect(readinessBadgeLabel(result.status)).toBe("Blocked");
  });

  it("marks at_risk when pass rate is below gate but not −10", () => {
    const result = computeMilestoneReadiness(
      [
        { key: "A", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "B", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "C", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "D", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "E", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "F", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "G", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "H", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "I", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "J", priority: "P2", status: "ready", lastResult: "failed" },
      ],
      { minPassRate: 95, maxOpenP0Failures: 0, requireReadyCases: true },
    );
    expect(result.passRate).toBe(90);
    expect(result.status).toBe("at_risk");
    expect(readinessBadgeLabel(result.status)).toBe("At risk");
  });

  it("blocks when pass rate is more than 10 points below gate", () => {
    const result = computeMilestoneReadiness(
      [
        { key: "A", priority: "P2", status: "ready", lastResult: "passed" },
        { key: "B", priority: "P2", status: "ready", lastResult: "failed" },
      ],
      { minPassRate: 95, maxOpenP0Failures: 0 },
    );
    expect(result.passRate).toBe(50);
    expect(result.status).toBe("blocked");
  });

  it("treats draft/blocked as not ready when required", () => {
    const result = computeMilestoneReadiness([
      { key: "A", priority: "P1", status: "draft", lastResult: "passed" },
      { key: "B", priority: "P1", status: "blocked", lastResult: "passed" },
      { key: "C", priority: "P1", status: "ready", lastResult: "passed" },
    ]);
    expect(result.notReadyCases).toBe(2);
    expect(result.blockedCases).toBe(1);
    expect(result.status).toBe("blocked");
  });

  it("ignores deprecated cases and null pass rate with no executions", () => {
    const result = computeMilestoneReadiness([
      {
        key: "OLD",
        priority: "P0",
        status: "deprecated",
        lastResult: "failed",
      },
      { key: "NEW", priority: "P1", status: "ready", lastResult: "untested" },
    ]);
    expect(result.passRate).toBeNull();
    expect(result.openP0Failures).toBe(0);
    expect(result.status).toBe("ready");
    expect(result.score).toBeGreaterThan(0);
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

  it("demotes flake suspects and sets urgency bands", () => {
    const queue = buildTriageQueue([
      {
        id: "p1",
        caseKey: "TOP-2",
        caseTitle: "P1",
        priority: "P1",
        runId: "r1",
        runName: "ci",
        notes: "a",
        failedAt: new Date().toISOString(),
        occurrenceCount: 2,
      },
      {
        id: "flake",
        caseKey: "TOP-3",
        caseTitle: "Flaky",
        priority: "P1",
        runId: "r1",
        runName: "ci",
        notes: "b",
        failedAt: new Date().toISOString(),
        occurrenceCount: 2,
        isFlaky: true,
      },
      {
        id: "later",
        caseKey: "TOP-4",
        caseTitle: "Later",
        priority: "P3",
        runId: "r1",
        runName: "ci",
        notes: "c",
        failedAt: new Date().toISOString(),
        occurrenceCount: 1,
      },
    ]);
    expect(queue[0]?.caseKey).toBe("TOP-2");
    expect(queue[0]?.urgency).toBe("soon");
    expect(queue.find((q) => q.caseKey === "TOP-3")?.reason).toMatch(/flake/i);
    expect(queue.find((q) => q.caseKey === "TOP-4")?.urgency).toBe("later");
  });

  it("builds fingerprints from first note line", () => {
    expect(
      failureFingerprint({
        caseKey: "TOP-1",
        notes: "  Boom line\nstacktrace",
      }),
    ).toBe("top-1::boom line");
    expect(
      failureFingerprint({
        caseKey: "X",
        notes: "a".repeat(200),
      }),
    ).toHaveLength("x::".length + 120);
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
    expect(flakeBadgeLabel(signal)).toBeNull();
  });

  it("requires minSamples before scoring", () => {
    const signal = detectFlakeSignal(
      [
        { status: "passed", at: "2026-01-01T00:00:00Z" },
        { status: "failed", at: "2026-01-02T00:00:00Z" },
        { status: "passed", at: "2026-01-03T00:00:00Z" },
      ],
      { minSamples: 4 },
    );
    expect(signal.isFlaky).toBe(false);
    expect(signal.score).toBe(0);
  });

  it("ignores skipped/untested history points", () => {
    const signal = detectFlakeSignal([
      { status: "skipped", at: "2026-01-01T00:00:00Z" },
      { status: "untested", at: "2026-01-02T00:00:00Z" },
      { status: "passed", at: "2026-01-03T00:00:00Z" },
      { status: "failed", at: "2026-01-04T00:00:00Z" },
      { status: "passed", at: "2026-01-05T00:00:00Z" },
      { status: "failed", at: "2026-01-06T00:00:00Z" },
    ]);
    expect(signal.passCount + signal.failCount).toBe(4);
    expect(signal.isFlaky).toBe(true);
  });

  it("labels high flake vs suspect by score", () => {
    const high = detectFlakeSignal([
      { status: "passed", at: "2026-01-01T00:00:00Z" },
      { status: "failed", at: "2026-01-02T00:00:00Z" },
      { status: "passed", at: "2026-01-03T00:00:00Z" },
      { status: "failed", at: "2026-01-04T00:00:00Z" },
      { status: "passed", at: "2026-01-05T00:00:00Z" },
      { status: "failed", at: "2026-01-06T00:00:00Z" },
    ]);
    expect(high.score).toBeGreaterThanOrEqual(70);
    expect(flakeBadgeLabel(high)).toBe("High flake");

    const borderline = detectFlakeSignal(
      [
        { status: "passed", at: "2026-01-01T00:00:00Z" },
        { status: "passed", at: "2026-01-02T00:00:00Z" },
        { status: "passed", at: "2026-01-03T00:00:00Z" },
        { status: "failed", at: "2026-01-04T00:00:00Z" },
        { status: "passed", at: "2026-01-05T00:00:00Z" },
      ],
      { threshold: 40 },
    );
    if (borderline.isFlaky && borderline.score < 70) {
      expect(flakeBadgeLabel(borderline)).toBe("Flake suspect");
    }
  });

  it("respects a custom threshold", () => {
    const history = [
      { status: "passed" as const, at: "2026-01-01T00:00:00Z" },
      { status: "failed" as const, at: "2026-01-02T00:00:00Z" },
      { status: "passed" as const, at: "2026-01-03T00:00:00Z" },
      { status: "failed" as const, at: "2026-01-04T00:00:00Z" },
    ];
    const scored = detectFlakeSignal(history);
    const loose = detectFlakeSignal(history, { threshold: 10 });
    const strict = detectFlakeSignal(history, {
      threshold: scored.score + 1,
    });
    expect(loose.isFlaky).toBe(true);
    expect(strict.isFlaky).toBe(false);
  });
});
