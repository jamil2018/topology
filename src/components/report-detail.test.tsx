import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "@/test/render";
import { ReportDetail } from "./report-detail";

afterEach(() => {
  cleanup();
});

const baseReport = {
  run: {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    name: "Checkout smoke",
    description: "",
    status: "completed",
    kind: "manual",
    source: "manual",
    environment: "staging",
    branch: "main",
    commitSha: "abcdef1",
    startedAt: "2026-10-22T00:00:00.000Z",
    completedAt: "2026-10-22T01:00:00.000Z",
    createdAt: "2026-10-22T00:00:00.000Z",
    updatedAt: "2026-10-22T01:00:00.000Z",
  },
  kpis: {
    passed: 8,
    failed: 1,
    skipped: 0,
    blocked: 0,
    untested: 0,
    total: 9,
    flake: 0,
    executed: 9,
    passRate: 89,
    durationMs: 3600000,
    averageDurationMs: 400,
    timedResultCount: 9,
  },
  executive: {
    verdict: "fail" as const,
    verdictLabel: "Failed",
    linkedDefects: 2,
    passRateDelta: -4,
  },
  suiteBreakdown: [],
  timeline: [],
  failures: [
    {
      resultId: "res-1",
      caseId: "c-1",
      caseKey: "HAR-9",
      title: "Coupon total",
      priority: "P0",
      suite: "Cart",
      notes: "Wrong amount",
      durationMs: 1200,
      executedAt: "2026-10-22T00:30:00.000Z",
      isFlaky: false,
      flakeHint: null,
      attachments: [
        {
          id: "att-1",
          filename: "coupon.png",
          contentType: "image/png",
          kind: "screenshot",
          url: "/api/attachments/att-1",
        },
      ],
    },
  ],
  trend: [],
};

describe("ReportDetail", () => {
  it("renders executive summary and evidence thumbnails", () => {
    render(<ReportDetail report={baseReport} />);

    const summary = screen.getByLabelText("Executive summary");
    expect(summary).toBeInTheDocument();
    expect(summary).toHaveTextContent("Failed");
    expect(summary).toHaveTextContent("Linked defects");
    expect(summary).toHaveTextContent("2");
    expect(summary).toHaveTextContent("-4 pts");
    expect(screen.getByRole("img", { name: "coupon.png" })).toHaveAttribute(
      "src",
      "/api/attachments/att-1",
    );
  });

  it("labels in-progress reports as Live", () => {
    render(
      <ReportDetail
        report={{
          ...baseReport,
          run: { ...baseReport.run, status: "in_progress", completedAt: null },
          executive: {
            verdict: "live",
            verdictLabel: "Live",
            linkedDefects: 1,
            passRateDelta: null,
          },
        }}
      />,
    );

    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
    expect(screen.getByText("Report · live run")).toBeInTheDocument();
    expect(screen.getByLabelText("Executive summary")).toHaveTextContent("—");
  });
});
