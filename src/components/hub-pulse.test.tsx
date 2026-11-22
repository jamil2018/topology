import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { HubPulse } from "./hub-pulse";
import { QualityGraphProvider } from "./quality-graph-provider";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  document.cookie =
    "topology-hub-view-test-project=; Path=/; Max-Age=0; SameSite=Lax";
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

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("My assigned runs")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Failing now" })).toHaveAttribute(
      "href",
      "/triage",
    );
    expect(screen.getByRole("tab", { name: "My work" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("link", { name: "Start run" })).toHaveAttribute(
      "href",
      "/runs/new",
    );
    expect(screen.getByText(/1 open failure/)).toBeInTheDocument();
    expect(screen.queryByText("Graph coverage")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "EM" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Release switcher")).not.toBeInTheDocument();
  });
});

describe("HubPulse graph containment", () => {
  it("hides graph coverage and gaps when the graph is off", () => {
    renderHub(false, "overview");

    expect(screen.queryByText("Graph coverage")).not.toBeInTheDocument();
    expect(screen.queryByText("Potential gaps")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /HAR-12/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Impact" })).toHaveAttribute(
      "href",
      "/impact",
    );
    expect(screen.getByRole("link", { name: "Open Proposals" })).toHaveAttribute(
      "href",
      "/proposals",
    );
    expect(screen.queryByRole("link", { name: "Intents" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Milestones" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "CI setup" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Test cases" })).toBeInTheDocument();
  });

  it("shows coverage bars and gaps when the graph is on", () => {
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
    expect(screen.getByRole("link", { name: /HAR-12/i })).toHaveAttribute(
      "href",
      "/intents?intent=intent-1",
    );
  });

  it("opens Overview from QA home without making persona the default", async () => {
    const user = userEvent.setup();
    renderHub(false);

    await user.click(screen.getByRole("tab", { name: "Overview" }));
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("radio", { name: "EM" })).toBeInTheDocument();
    expect(
      screen.getByText(/Show every Overview section without a persona filter/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "EM" }));
    expect(
      screen.getByText(/Engineering manager — quality health/),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Impact" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /HAR-12/i })).not.toBeInTheDocument();
  });

  it("renders SSR cookie view without post-paint flip and persists toggles", async () => {
    const user = userEvent.setup();
    render(
      <QualityGraphProvider
        workspaceId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        initialEnabled={false}
      >
        <HubPulse
          pulse={pulse}
          milestone={null}
          initialView="overview"
          hasUrlView={false}
        />
      </QualityGraphProvider>,
    );

    // First paint matches the server-provided cookie/URL preference.
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "My work" }));
    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "My work" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(window.localStorage.getItem("topology:hub-view:test-project")).toBe(
      "home",
    );
    expect(document.cookie).toMatch(/topology-hub-view-test-project=home/);
  });

  it("keeps explicit URL home view even when overview was preferred", () => {
    render(
      <QualityGraphProvider
        workspaceId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        initialEnabled={false}
      >
        <HubPulse
          pulse={pulse}
          milestone={null}
          initialView="home"
          hasUrlView
        />
      </QualityGraphProvider>,
    );

    expect(screen.getByRole("heading", { name: "Home" })).toBeInTheDocument();
  });

  it("keeps the Home view switcher right-aligned and stable across My work and Overview", async () => {
    const user = userEvent.setup();
    renderHub(false);

    const tablist = screen.getByRole("tablist", { name: "Home view" });
    expect(tablist).toBeInTheDocument();
    expect(tablist.className).toMatch(/border/);
    expect(
      within(tablist).getByRole("tab", { name: "My work" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(tablist).getByRole("tab", { name: "Overview" }),
    ).toBeInTheDocument();

    // Switcher sits in a right-aligned top row above PageHeader.
    const switcherRow = tablist.parentElement;
    expect(switcherRow?.className).toMatch(/justify-end/);
    const heading = screen.getByRole("heading", { name: "Home" });
    expect(tablist.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    await user.click(within(tablist).getByRole("tab", { name: "Overview" }));

    const tablistAfter = screen.getByRole("tablist", { name: "Home view" });
    expect(tablistAfter).toBe(tablist);
    expect(tablistAfter.parentElement).toBe(switcherRow);
    expect(
      within(tablistAfter).getByRole("tab", { name: "Overview" }),
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(tablistAfter).getByRole("tab", { name: "My work" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Overview" }),
    ).toBeInTheDocument();
    // Persona controls live in the Overview sub-bar, not the top switcher.
    expect(
      within(tablistAfter).queryByRole("radio", { name: "EM" }),
    ).not.toBeInTheDocument();
  });

  it("shows the release switcher in the Overview sub-bar when the graph has releases", () => {
    render(
      <QualityGraphProvider
        workspaceId="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        initialEnabled={true}
      >
        <HubPulse
          pulse={pulse}
          milestone={null}
          initialView="overview"
          releases={[
            { id: "rel-1", name: "1.0.0", gitTag: null, sha: null },
            { id: "rel-2", name: "1.1.0", gitTag: null, sha: null },
          ]}
          selectedReleaseId="rel-1"
        />
      </QualityGraphProvider>,
    );

    expect(
      screen.getByRole("radiogroup", { name: "Overview persona" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "EM" })).toBeInTheDocument();
    // HeroUI Select accessible name includes value + aria-label + field label.
    const release = screen.getByRole("button", { name: /Release switcher/ });
    expect(release).toHaveAttribute("aria-label", "Release switcher");
    expect(release).toHaveTextContent("1.0.0");

    const homeTabs = screen.getByRole("tablist", { name: "Home view" });
    expect(
      within(homeTabs).queryByRole("button", { name: /Release switcher/ }),
    ).not.toBeInTheDocument();
    expect(within(homeTabs).queryByRole("radio", { name: "EM" })).not.toBeInTheDocument();
  });
});
