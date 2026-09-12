import { describe, expect, it } from "vitest";
import {
  buildReportKpis,
  buildResultTimeline,
  buildSuiteBreakdown,
  computePassRate,
  countStatuses,
  describeDonutArc,
  donutSegments,
  failureRowsFromResults,
  formatDuration,
  type ReportResultInput,
} from "./report-stats";

const sample: ReportResultInput[] = [
  {
    id: "1",
    status: "passed",
    durationMs: 120,
    executedAt: "2026-09-01T10:00:00Z",
    case: {
      id: "c1",
      key: "TC-1",
      title: "Login",
      priority: "P1",
      folder: { id: "f1", name: "Auth" },
    },
  },
  {
    id: "2",
    status: "failed",
    notes: "timeout",
    durationMs: 800,
    executedAt: "2026-09-01T10:01:00Z",
    case: {
      id: "c2",
      key: "TC-2",
      title: "Checkout",
      priority: "P0",
      folder: { id: "f2", name: "Cart" },
    },
  },
  {
    id: "3",
    status: "skipped",
    classname: "suite.Misc",
    title: "Flaky skip",
  },
  {
    id: "4",
    status: "untested",
    case: { id: "c4", key: "TC-4", title: "Pending", folder: null },
  },
];

describe("countStatuses / passRate", () => {
  it("counts each status and computes pass rate from executed only", () => {
    const counts = countStatuses(sample);
    expect(counts).toEqual({
      passed: 1,
      failed: 1,
      skipped: 1,
      blocked: 0,
      untested: 1,
      total: 4,
    });
    expect(computePassRate(counts.passed, counts.failed)).toBe(50);
    expect(computePassRate(0, 0)).toBeNull();
  });
});

describe("buildReportKpis", () => {
  it("prefers wall-clock duration over sum of result durations", () => {
    const kpis = buildReportKpis(sample, {
      flake: 1,
      startedAt: "2026-09-01T10:00:00Z",
      completedAt: "2026-09-01T10:05:00Z",
    });
    expect(kpis.passRate).toBe(50);
    expect(kpis.flake).toBe(1);
    expect(kpis.durationMs).toBe(5 * 60 * 1000);
  });
});

describe("buildSuiteBreakdown", () => {
  it("groups by folder then classname", () => {
    const rows = buildSuiteBreakdown(sample);
    expect(rows.map((r) => r.label)).toEqual(["Cart", "Auth", "suite.Misc", "Unfiled"]);
    expect(rows[0].failed).toBe(1);
  });
});

describe("buildResultTimeline", () => {
  it("accumulates pass/fail in execution order", () => {
    const points = buildResultTimeline(sample);
    expect(points).toHaveLength(2);
    expect(points[0]).toMatchObject({
      cumulativePassed: 1,
      cumulativeFailed: 0,
    });
    expect(points[1]).toMatchObject({
      cumulativePassed: 1,
      cumulativeFailed: 1,
    });
  });
});

describe("failureRowsFromResults", () => {
  it("ranks real failures before flakes and includes suite", () => {
    const rows = failureRowsFromResults(sample, new Map([
      ["c2", { isFlaky: true, hint: "flippy" }],
    ]));
    expect(rows).toHaveLength(1);
    expect(rows[0].caseKey).toBe("TC-2");
    expect(rows[0].isFlaky).toBe(true);
    expect(rows[0].suite).toBe("Cart");
  });
});

describe("donut + formatDuration", () => {
  it("builds arcs and formats durations", () => {
    const segs = donutSegments(countStatuses(sample));
    expect(segs.length).toBeGreaterThan(0);
    expect(describeDonutArc(50, 50, 40, 24, 0, Math.PI).startsWith("M ")).toBe(
      true,
    );
    expect(formatDuration(null)).toBe("—");
    expect(formatDuration(500)).toBe("500ms");
    expect(formatDuration(12_000)).toBe("12s");
  });
});
