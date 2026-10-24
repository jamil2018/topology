import { describe, expect, it } from "vitest";
import {
  filterRunReports,
  parseReportRange,
  parseReportsDashboardQuery,
  rangeToDateBounds,
  reportsDashboardSearch,
} from "./report-dashboard";

describe("parseReportRange", () => {
  it("accepts known ranges and defaults to 30d", () => {
    expect(parseReportRange("7d")).toBe("7d");
    expect(parseReportRange("90d")).toBe("90d");
    expect(parseReportRange("all")).toBe("all");
    expect(parseReportRange("nope")).toBe("30d");
    expect(parseReportRange(undefined)).toBe("30d");
  });
});

describe("parseReportsDashboardQuery", () => {
  it("reads range, plan uuid, and environment", () => {
    const plan = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    expect(
      parseReportsDashboardQuery({
        range: "7d",
        plan,
        environment: "staging",
      }),
    ).toEqual({
      range: "7d",
      planId: plan,
      environment: "staging",
    });
  });

  it("drops invalid plan ids and empty environment", () => {
    expect(
      parseReportsDashboardQuery({
        range: ["90d"],
        plan: "not-a-uuid",
        environment: "  ",
      }),
    ).toEqual({
      range: "90d",
      planId: null,
      environment: null,
    });
  });
});

describe("rangeToDateBounds / search", () => {
  it("computes inclusive windows and omits default params", () => {
    const now = new Date("2026-10-24T12:00:00.000Z");
    const week = rangeToDateBounds("7d", now);
    expect(week.from?.toISOString()).toBe("2026-10-17T12:00:00.000Z");
    expect(rangeToDateBounds("all", now).from).toBeNull();
    expect(
      reportsDashboardSearch({
        range: "30d",
        planId: null,
        environment: null,
      }),
    ).toBe("");
    expect(
      reportsDashboardSearch({
        range: "7d",
        planId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        environment: "ci",
      }),
    ).toBe("range=7d&plan=aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa&environment=ci");
  });
});

describe("filterRunReports", () => {
  it("keeps reports inside the window and matching plan/env", () => {
    const reports = [
      {
        completedAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-20T00:00:00.000Z",
        environment: "staging",
        planId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      },
      {
        completedAt: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-09-01T00:00:00.000Z",
        environment: "staging",
        planId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      },
      {
        completedAt: "2026-10-20T00:00:00.000Z",
        updatedAt: "2026-10-20T00:00:00.000Z",
        environment: "local",
        planId: null,
      },
    ];
    const kept = filterRunReports(
      reports,
      {
        range: "30d",
        planId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        environment: "staging",
      },
      new Date("2026-10-24T12:00:00.000Z"),
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].completedAt).toBe("2026-10-20T00:00:00.000Z");
  });
});
