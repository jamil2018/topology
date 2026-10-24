import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QaHome } from "./qa-home";
import type { HubPulseData } from "./hub-types";

afterEach(() => {
  cleanup();
});

const pulse: HubPulseData = {
  cases: { total: 12, ready: 10, blocked: 1, draft: 1 },
  runs: { total: 3, inProgress: 1, completed: 2, automation: 0 },
  results: { passed: 8, failed: 2, untested: 2, total: 12, passRate: 80 },
  folders: 6,
  recentRuns: [],
  assignedRuns: [
    {
      id: "run-assigned",
      name: "Checkout regression",
      status: "in_progress",
      kind: "manual",
      passed: 4,
      failed: 1,
      untested: 3,
    },
  ],
  inProgressRuns: [
    {
      id: "run-assigned",
      name: "Checkout regression",
      status: "in_progress",
      passed: 4,
      failed: 1,
      untested: 3,
    },
  ],
  failingNow: [
    {
      id: "triage-1",
      title: "Cart total is wrong after coupon",
      priority: "P0",
      runId: "run-assigned",
      caseKey: "HAR-12",
    },
  ],
  retestQueue: [
    {
      id: "issue-1",
      key: "LIN-9",
      title: "Coupon math",
      caseKey: "HAR-12",
      runId: "run-assigned",
      resultId: null,
    },
  ],
};

describe("QaHome", () => {
  it("shows assigned runs, in-progress progress, failing now, and retest", () => {
    render(<QaHome pulse={pulse} />);

    expect(screen.getByText("My assigned runs")).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /Checkout regression/i })[0],
    ).toHaveAttribute("href", "/runs/run-assigned");
    expect(screen.getByRole("heading", { name: "In progress" })).toBeInTheDocument();
    expect(
      screen.getAllByRole("progressbar", { name: /Run progress 63%/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: "Failing now" })).toHaveAttribute(
      "href",
      "/triage",
    );
    expect(screen.getByRole("link", { name: /HAR-12/i })).toHaveAttribute(
      "href",
      "/triage",
    );
    expect(screen.getByText("Retest queue")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Retest" })).toHaveAttribute(
      "href",
      "/runs/run-assigned",
    );
    expect(screen.queryByText("Graph coverage")).not.toBeInTheDocument();
    expect(screen.queryByText("EM")).not.toBeInTheDocument();
  });
});
