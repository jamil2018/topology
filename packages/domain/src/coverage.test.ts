import { describe, expect, it } from "vitest";
import { computeCoverage } from "./coverage";
import { computeFreshness, freshnessLabel } from "./freshness";

describe("computeCoverage", () => {
  it("returns N/A (null pct) when no requirements or risks exist", () => {
    const report = computeCoverage({
      requirements: [],
      risks: [],
      intents: [
        {
          id: "i1",
          key: "AUTH-1",
          title: "Login",
          criticality: "P0",
          implementations: [{ type: "manual" }],
          lastExecutedAt: null,
        },
      ],
      edges: [],
    });
    expect(report.requirement.pct).toBeNull();
    expect(report.requirement.total).toBe(0);
    expect(report.risk.pct).toBeNull();
    expect(report.automation.pct).toBe(0);
    expect(report.execution.pct).toBe(0);
    expect(report.gaps.some((g) => g.kind === "manual_only_p0")).toBe(true);
    expect(report.gaps.some((g) => g.kind === "never_executed")).toBe(true);
  });

  it("counts requirement coverage via covers edges", () => {
    const report = computeCoverage({
      requirements: [
        { id: "r1", key: "REQ-1", title: "Lockout" },
        { id: "r2", key: "REQ-2", title: "Refund" },
      ],
      risks: [{ id: "k1", key: "RISK-1", title: "Auth bypass", criticality: "P0" }],
      intents: [
        {
          id: "i1",
          key: "AUTH-021",
          title: "Account lockout",
          criticality: "P0",
          implementations: [{ type: "manual" }, { type: "junit" }],
          lastExecutedAt: "2026-09-01T00:00:00.000Z",
        },
      ],
      edges: [
        {
          fromType: "requirement",
          fromId: "r1",
          toType: "intent",
          toId: "i1",
          relation: "covers",
        },
        {
          fromType: "intent",
          fromId: "i1",
          toType: "risk",
          toId: "k1",
          relation: "mitigates",
        },
      ],
    });
    expect(report.requirement).toEqual({ covered: 1, total: 2, pct: 50 });
    expect(report.risk).toEqual({ covered: 1, total: 1, pct: 100 });
    expect(report.automation).toEqual({ covered: 1, total: 1, pct: 100 });
    expect(report.execution).toEqual({ covered: 1, total: 1, pct: 100 });
    expect(report.gaps).toEqual([
      {
        kind: "uncovered_requirement",
        id: "r2",
        key: "REQ-2",
        title: "Refund",
      },
    ]);
  });

  it("treats automation as any non-manual implementation", () => {
    const report = computeCoverage({
      requirements: [],
      risks: [],
      intents: [
        {
          id: "a",
          key: "A",
          title: "A",
          criticality: "P1",
          implementations: [{ type: "playwright" }],
          lastExecutedAt: new Date("2026-01-01"),
        },
        {
          id: "b",
          key: "B",
          title: "B",
          criticality: "P1",
          implementations: [{ type: "manual" }],
          lastExecutedAt: new Date("2026-01-01"),
        },
        {
          id: "c",
          key: "C",
          title: "C",
          criticality: "P2",
          implementations: [],
          lastExecutedAt: null,
        },
      ],
      edges: [],
    });
    expect(report.automation).toEqual({ covered: 1, total: 3, pct: 33 });
    expect(report.execution).toEqual({ covered: 2, total: 3, pct: 67 });
  });
});

describe("computeFreshness", () => {
  it("returns unverified when never executed", () => {
    expect(computeFreshness(null)).toBe("unverified");
    expect(computeFreshness(undefined)).toBe("unverified");
    expect(computeFreshness("")).toBe("unverified");
    expect(freshnessLabel("unverified")).toBe("Unverified");
  });

  it("returns fresh when last execution exists", () => {
    expect(computeFreshness(new Date())).toBe("fresh");
    expect(computeFreshness("2026-09-01T00:00:00.000Z")).toBe("fresh");
    expect(freshnessLabel("fresh")).toBe("Fresh");
  });
});
