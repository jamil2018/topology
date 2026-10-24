import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HubPulse } from "./hub-pulse";
import { QualityGraphProvider } from "./quality-graph-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

const pulse = {
  cases: { total: 12, ready: 10, blocked: 1, draft: 1 },
  runs: { total: 3, inProgress: 1, completed: 2, automation: 0 },
  results: { passed: 8, failed: 2, untested: 2, total: 12, passRate: 80 },
  folders: 6,
  recentRuns: [],
  assignedRuns: [
    {
      id: "run-mine",
      name: "Smoke pass",
      status: "in_progress",
      passed: 2,
      failed: 0,
      untested: 2,
    },
  ],
  failingNow: [
    {
      id: "triage-1",
      title: "Cart persists after a page reload",
      priority: "P1",
      runId: "run-mine",
      caseKey: "HAR-12",
    },
  ],
  coverage: {
    requirement: { covered: 1, total: 2, pct: 50 },
    risk: { covered: 1, total: 1, pct: 100 },
    automation: { covered: 1, total: 4, pct: 25 },
    execution: { covered: 3, total: 4, pct: 75 },
    gaps: [
      {
        kind: "never_executed",
        id: "intent-1",
        key: "HAR-12",
        title: "Cart persists after a page reload",
      },
    ],
  },
};

function renderHub(
  qualityGraphEnabled: boolean,
  initialView: "home" | "overview" = "home",
) {
  return render(
    <QualityGraphProvider
      workspaceId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
      initialEnabled={qualityGraphEnabled}
    >
      <HubPulse
        pulse={pulse}
        milestone={null}
        initialView={initialView}
      />
    </QualityGraphProvider>,
  );
}

describe("HubPulse default QA home", () => {
  it("opens on QA home instead of the persona pulse", () => {
    renderHub(false);

    expect(screen.getByRole("heading", { name: "QA home" })).toBeInTheDocument();
    expect(screen.getByText("My assigned runs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Failing now" })).toHaveAttribute(
      "href",
      "/triage",
    );
    expect(screen.getByRole("tab", { name: "QA home" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.queryByText("Graph coverage")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "EM" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Release switcher")).not.toBeInTheDocument();
  });
});

describe("HubPulse graph containment", () => {
  it("links gaps to cases and hides the coverage card when the graph is off", () => {
    renderHub(false, "overview");

    const gap = screen.getByRole("link", { name: /HAR-12/i });
    expect(gap).toHaveAttribute("href", "/cases?q=HAR-12");
    expect(screen.queryByText("Graph coverage")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Intents" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Milestones" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CI setup" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Test cases" })).toBeInTheDocument();
  });

  it("shows coverage bars when the graph is on and points automation at cases", () => {
    renderHub(true, "overview");

    expect(screen.getByText("Graph coverage")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Automation/i })).toHaveAttribute(
      "href",
      "/cases?q=automation",
    );
    expect(screen.getByRole("link", { name: /Execution/i })).toHaveAttribute(
      "href",
      "/cases",
    );
  });

  it("opens Overview from QA home without making persona the default", async () => {
    const user = userEvent.setup();
    renderHub(false);

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByRole("heading", { name: "Quality pulse" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "EM" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /HAR-12/i })).toHaveAttribute(
      "href",
      "/cases?q=HAR-12",
    );
  });
});
