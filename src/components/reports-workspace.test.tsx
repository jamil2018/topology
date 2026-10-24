import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReportsWorkspace } from "./reports-workspace";
import { emptyReportsDashboard } from "@/lib/report-dashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

const dashboard = {
  ...emptyReportsDashboard(),
  kpis: {
    runs: 2,
    passed: 18,
    failed: 2,
    skipped: 1,
    blocked: 0,
    executed: 20,
    passRate: 90,
  },
  trend: [
    { date: "2026-10-20", passed: 8, failed: 1, passRate: 89 },
    { date: "2026-10-22", passed: 10, failed: 1, passRate: 91 },
  ],
  bySuite: [
    {
      key: "folder:auth",
      label: "Auth",
      passed: 10,
      failed: 1,
      skipped: 0,
      blocked: 0,
      untested: 0,
      total: 11,
      passRate: 91,
    },
  ],
  readiness: [
    {
      id: "ms-1",
      name: "1.4 checkout",
      status: "at_risk",
      score: 72,
      passRate: 90,
      badge: "At risk",
      reasons: ["Pass rate below gate"],
      passRateThreshold: 95,
    },
  ],
  testers: [
    {
      id: "u-1",
      name: "Ada",
      executed: 12,
      passed: 11,
      failed: 1,
      passRate: 92,
    },
  ],
  topFailing: [
    {
      caseId: "c-1",
      caseKey: "HAR-12",
      title: "Cart total is wrong after coupon",
      failCount: 3,
    },
  ],
};

describe("ReportsWorkspace", () => {
  it("explains that only completed runs produce reports", () => {
    render(
      <ReportsWorkspace reports={[]} dashboard={emptyReportsDashboard()} />,
    );
    expect(screen.getByText("No run reports yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Reports appear after a run is completed/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/in-progress/i)).not.toBeInTheDocument();
    expect(screen.getByText("Pass-rate trend")).toBeInTheDocument();
  });

  it("renders the cross-run dashboard and drill-down list", () => {
    render(
      <ReportsWorkspace
        dashboard={dashboard}
        reports={[
          {
            runId: "run-1",
            name: "Nightly",
            status: "completed",
            kind: "automation",
            source: "ci",
            environment: "ci",
            planId: null,
            branch: "main",
            commitSha: "abc1234",
            startedAt: "2026-10-22T00:00:00.000Z",
            completedAt: "2026-10-22T01:00:00.000Z",
            updatedAt: "2026-10-22T01:00:00.000Z",
            createdAt: "2026-10-22T00:00:00.000Z",
            passed: 10,
            failed: 1,
            skipped: 0,
            blocked: 0,
            untested: 0,
            total: 11,
            passRate: 91,
            durationMs: 3600000,
          },
        ]}
      />,
    );

    expect(screen.getByText("Pass-rate trend")).toBeInTheDocument();
    expect(screen.getByText("Results by suite")).toBeInTheDocument();
    expect(screen.getByText("Release readiness")).toBeInTheDocument();
    expect(screen.getByText("Tester throughput")).toBeInTheDocument();
    expect(screen.getByText("Top failing cases")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /HAR-12/i })).toHaveAttribute(
      "href",
      "/cases/HAR-12",
    );
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Nightly/i })).toHaveAttribute(
      "href",
      "/reports/run-1",
    );
    expect(screen.getByLabelText("Date range")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by plan")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by environment")).toBeInTheDocument();
  });
});
