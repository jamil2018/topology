import { describe, expect, it } from "vitest";
import {
  computeReliability,
  detectReliabilityRegression,
} from "./reliability";

describe("computeReliability", () => {
  it("computes overall pass rate from decisive outcomes", () => {
    const report = computeReliability([
      { status: "passed", at: "2026-01-01T00:00:00Z", browser: "Chrome" },
      { status: "passed", at: "2026-01-02T00:00:00Z", browser: "Chrome" },
      { status: "failed", at: "2026-01-03T00:00:00Z", browser: "Chrome" },
      { status: "skipped", at: "2026-01-04T00:00:00Z", browser: "Chrome" },
    ]);
    expect(report.overall.passCount).toBe(2);
    expect(report.overall.failCount).toBe(1);
    expect(report.overall.sampleCount).toBe(3);
    expect(report.overall.passRate).toBe(66.7);
  });

  it("splits pass rate by browser and os", () => {
    const report = computeReliability([
      {
        status: "passed",
        at: "2026-01-01T00:00:00Z",
        browser: "Chrome",
        os: "linux",
      },
      {
        status: "passed",
        at: "2026-01-02T00:00:00Z",
        browser: "Chrome",
        os: "linux",
      },
      {
        status: "failed",
        at: "2026-01-03T00:00:00Z",
        browser: "Safari",
        os: "macos",
      },
      {
        status: "passed",
        at: "2026-01-04T00:00:00Z",
        browser: "Safari",
        os: "macos",
      },
      {
        status: "failed",
        at: "2026-01-05T00:00:00Z",
        browser: "Safari",
        os: "macos",
      },
      {
        status: "failed",
        at: "2026-01-06T00:00:00Z",
        browser: "Safari",
        os: "macos",
      },
    ]);

    const chrome = report.byBrowser.find((s) => s.key === "chrome");
    const safari = report.byBrowser.find((s) => s.key === "safari");
    expect(chrome?.passRate).toBe(100);
    expect(safari?.passRate).toBe(25);
    expect(report.byOs.find((s) => s.key === "linux")?.passRate).toBe(100);
    expect(report.byOs.find((s) => s.key === "macos")?.passRate).toBe(25);
  });

  it("returns null pass rate when nothing decisive exists", () => {
    const report = computeReliability([
      { status: "skipped", at: "2026-01-01T00:00:00Z", browser: "Chrome" },
      { status: "untested", at: "2026-01-02T00:00:00Z" },
    ]);
    expect(report.overall.passRate).toBeNull();
    expect(report.byBrowser).toHaveLength(0);
  });
});

describe("detectReliabilityRegression", () => {
  it("flags a browser slice that drops vs the prior window", () => {
    const previous = [
      { status: "passed" as const, at: "2026-01-01T00:00:00Z", browser: "Safari" },
      { status: "passed" as const, at: "2026-01-02T00:00:00Z", browser: "Safari" },
      { status: "passed" as const, at: "2026-01-03T00:00:00Z", browser: "Safari" },
      { status: "passed" as const, at: "2026-01-04T00:00:00Z", browser: "Chrome" },
      { status: "passed" as const, at: "2026-01-05T00:00:00Z", browser: "Chrome" },
      { status: "passed" as const, at: "2026-01-06T00:00:00Z", browser: "Chrome" },
    ];
    const current = [
      { status: "failed" as const, at: "2026-02-01T00:00:00Z", browser: "Safari" },
      { status: "failed" as const, at: "2026-02-02T00:00:00Z", browser: "Safari" },
      { status: "passed" as const, at: "2026-02-03T00:00:00Z", browser: "Safari" },
      { status: "passed" as const, at: "2026-02-04T00:00:00Z", browser: "Chrome" },
      { status: "passed" as const, at: "2026-02-05T00:00:00Z", browser: "Chrome" },
      { status: "passed" as const, at: "2026-02-06T00:00:00Z", browser: "Chrome" },
    ];

    const regressions = detectReliabilityRegression(current, previous);
    const safari = regressions.find(
      (r) => r.dimension === "browser" && r.key === "safari",
    );
    expect(safari).toBeDefined();
    expect(safari?.previousPassRate).toBe(100);
    expect(safari?.currentPassRate).toBeCloseTo(33.3, 0);
    expect(safari?.isRegression).toBe(true);
    expect(
      regressions.some((r) => r.dimension === "browser" && r.key === "chrome"),
    ).toBe(false);
  });

  it("ignores small drops below the threshold", () => {
    const previous = [
      { status: "passed" as const, at: "2026-01-01T00:00:00Z", browser: "Chrome" },
      { status: "passed" as const, at: "2026-01-02T00:00:00Z", browser: "Chrome" },
      { status: "passed" as const, at: "2026-01-03T00:00:00Z", browser: "Chrome" },
      { status: "failed" as const, at: "2026-01-04T00:00:00Z", browser: "Chrome" },
    ];
    // 75% → 75% (same)
    const current = [
      { status: "passed" as const, at: "2026-02-01T00:00:00Z", browser: "Chrome" },
      { status: "passed" as const, at: "2026-02-02T00:00:00Z", browser: "Chrome" },
      { status: "passed" as const, at: "2026-02-03T00:00:00Z", browser: "Chrome" },
      { status: "failed" as const, at: "2026-02-04T00:00:00Z", browser: "Chrome" },
    ];
    expect(detectReliabilityRegression(current, previous)).toHaveLength(0);
  });

  it("requires minSamples in both windows", () => {
    const previous = [
      { status: "passed" as const, at: "2026-01-01T00:00:00Z", browser: "Safari" },
      { status: "passed" as const, at: "2026-01-02T00:00:00Z", browser: "Safari" },
    ];
    const current = [
      { status: "failed" as const, at: "2026-02-01T00:00:00Z", browser: "Safari" },
      { status: "failed" as const, at: "2026-02-02T00:00:00Z", browser: "Safari" },
    ];
    expect(
      detectReliabilityRegression(current, previous, { minSamples: 3 }),
    ).toHaveLength(0);
  });
});
