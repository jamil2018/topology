import { describe, expect, it } from "vitest";
import {
  computeImplementationRollup,
  percentile,
} from "./implementation-stats";

describe("percentile", () => {
  it("returns null for empty input", () => {
    expect(percentile([], 50)).toBeNull();
  });

  it("returns the sole value for a singleton", () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it("uses nearest-rank for p50 and p95", () => {
    // sorted: 10,20,30,40,50,60,70,80,90,100
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    // rank(50) = ceil(0.5*10)-1 = 4 → 50
    expect(percentile(values, 50)).toBe(50);
    // rank(95) = ceil(0.95*10)-1 = 9 → 100
    expect(percentile(values, 95)).toBe(100);
  });

  it("clamps p outside 0–100", () => {
    expect(percentile([1, 2, 3], -10)).toBe(1);
    expect(percentile([1, 2, 3], 200)).toBe(3);
  });
});

describe("computeImplementationRollup", () => {
  it("computes pass rate from decisive outcomes only", () => {
    const rollup = computeImplementationRollup([
      { status: "passed", at: "2026-01-01T00:00:00Z", durationMs: 100 },
      { status: "failed", at: "2026-01-02T00:00:00Z", durationMs: 200 },
      { status: "skipped", at: "2026-01-03T00:00:00Z", durationMs: 50 },
      { status: "passed", at: "2026-01-04T00:00:00Z", durationMs: 150 },
    ]);
    expect(rollup.passRate).toBe(66.7);
    expect(rollup.lastStatus).toBe("passed");
    expect(rollup.lastRunAt?.toISOString()).toBe("2026-01-04T00:00:00.000Z");
  });

  it("returns null pass rate with no decisive samples", () => {
    const rollup = computeImplementationRollup([
      { status: "skipped", at: "2026-01-01T00:00:00Z" },
      { status: "blocked", at: "2026-01-02T00:00:00Z" },
    ]);
    expect(rollup.passRate).toBeNull();
    expect(rollup.durationP50).toBeNull();
    expect(rollup.durationP95).toBeNull();
  });

  it("computes duration percentiles and flake probability", () => {
    const history = [
      { status: "passed" as const, at: "2026-01-01T00:00:00Z", durationMs: 100 },
      { status: "failed" as const, at: "2026-01-02T00:00:00Z", durationMs: 200 },
      { status: "passed" as const, at: "2026-01-03T00:00:00Z", durationMs: 300 },
      { status: "failed" as const, at: "2026-01-04T00:00:00Z", durationMs: 400 },
      { status: "passed" as const, at: "2026-01-05T00:00:00Z", durationMs: 500 },
    ];
    const rollup = computeImplementationRollup(history);
    expect(rollup.durationP50).toBe(300);
    expect(rollup.durationP95).toBe(500);
    // Alternating pass/fail → non-zero flake score → probability in 0–1
    expect(rollup.flakeProbability).not.toBeNull();
    expect(rollup.flakeProbability!).toBeGreaterThan(0);
    expect(rollup.flakeProbability!).toBeLessThanOrEqual(1);
  });

  it("returns empty rollup for empty history", () => {
    const rollup = computeImplementationRollup([]);
    expect(rollup).toEqual({
      passRate: null,
      flakeProbability: null,
      durationP50: null,
      durationP95: null,
      lastRunAt: null,
      lastStatus: null,
    });
  });
});
