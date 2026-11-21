import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import {
  buildTriageQueue,
  failureSignatureHash,
} from "@topology/domain";
import { TriageWorkspace } from "./triage-workspace";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const sharedNotesA = "payment iframe timeout after 1000ms";
const sharedNotesB = "payment iframe timeout after 9000ms";
const sharedSig = failureSignatureHash({ notes: sharedNotesA });

const queue = buildTriageQueue([
  {
    id: "11111111-1111-1111-1111-111111111111",
    caseKey: "TOP-1",
    caseTitle: "Checkout chrome",
    priority: "P1",
    runId: "run-1",
    runName: "ci",
    notes: sharedNotesA,
    failedAt: new Date().toISOString(),
    occurrenceCount: 2,
    signatureId: sharedSig,
  },
  {
    id: "22222222-2222-2222-2222-222222222222",
    caseKey: "TOP-2",
    caseTitle: "Checkout safari",
    priority: "P2",
    runId: "run-1",
    runName: "ci",
    notes: sharedNotesB,
    failedAt: new Date().toISOString(),
    occurrenceCount: 1,
    signatureId: sharedSig,
  },
  {
    id: "33333333-3333-3333-3333-333333333333",
    caseKey: "TOP-3",
    caseTitle: "Solo failure",
    priority: "P3",
    runId: "run-2",
    runName: "nightly",
    notes: "unique boom",
    failedAt: new Date().toISOString(),
    occurrenceCount: 1,
    signatureId: failureSignatureHash({ notes: "unique boom" }),
  },
]).map((item) => ({
  ...item,
  resultId: null,
  caseId: null,
  flakeHint: null,
  issueKey: null,
  issueUrl: null,
}));

describe("TriageWorkspace signature clusters", () => {
  it("shows N failures · excerpt groups and expands to member failures", async () => {
    const user = userEvent.setup();
    render(<TriageWorkspace initialQueue={queue} flakeHints={[]} />);

    expect(screen.getByText(/2 signatures/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /2 failures · payment iframe timeout after 1000ms/i,
      }),
    ).toBeInTheDocument();

    // Collapsed cluster hides member case keys until expanded
    expect(screen.queryByText("TOP-2")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /2 failures · payment iframe timeout after 1000ms/i,
      }),
    );

    expect(screen.getByText("TOP-1")).toBeInTheDocument();
    expect(screen.getByText("TOP-2")).toBeInTheDocument();
    // Singleton remains visible without a cluster chrome row
    expect(screen.getByText("TOP-3")).toBeInTheDocument();
  });

  it("clamps long failure text until expanded", async () => {
    const user = userEvent.setup();
    const longNotes = `${"timeout after iframe ".repeat(12)}end`;
    render(
      <TriageWorkspace
        initialQueue={[
          {
            ...queue[2],
            notes: longNotes,
          },
        ]}
        flakeHints={[]}
      />,
    );

    expect(screen.getByRole("button", { name: "Show more" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getByRole("button", { name: "Show less" })).toBeInTheDocument();
  });

  it("hides the mock issue placeholder outside demo mode", () => {
    render(
      <TriageWorkspace
        initialQueue={[{ ...queue[2], resultId: "result-1" }]}
        flakeHints={[]}
        issueProvider="mock"
        demoMode={false}
      />,
    );

    expect(screen.queryByPlaceholderText(/MOCK-1/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/issue key/i)).toBeNull();
    expect(screen.queryByText("Demo issue")).toBeNull();
  });

  it("labels the mock provider as a demo issue in demo mode", () => {
    render(
      <TriageWorkspace
        initialQueue={[{ ...queue[2], resultId: "result-1" }]}
        flakeHints={[]}
        issueProvider="mock"
        demoMode
      />,
    );

    expect(screen.getByText("Demo issue")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Demo issue key")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/MOCK-1/i)).toBeNull();
  });

  it("shows linked issue state instead of a hardcoded No issue chip", () => {
    render(
      <TriageWorkspace
        initialQueue={[
          {
            ...queue[2],
            issueKey: "HAR-41",
            issueUrl: "https://example.test/HAR-41",
          },
        ]}
        flakeHints={[]}
      />,
    );

    expect(screen.queryByText("No issue")).toBeNull();
    const link = screen.getByRole("link", { name: /HAR-41/i });
    expect(link).toHaveAttribute("href", "https://example.test/HAR-41");
  });

  it("bulk resolves selected triage items", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TriageWorkspace
        initialQueue={[{ ...queue[2] }]}
        flakeHints={[]}
      />,
    );

    await user.click(screen.getByRole("checkbox", { name: /Select TOP-3/i }));
    expect(screen.getByText(/1 selected failures/i)).toBeInTheDocument();

    const resolveButtons = screen.getAllByRole("button", { name: /^Resolve$/i });
    await user.click(resolveButtons[resolveButtons.length - 1]!);
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Resolution outcome/i }),
      "wont_fix",
    );
    await user.click(screen.getByRole("button", { name: /Confirm resolve/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/triage",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          id: queue[2].id,
          status: "resolved",
          resolution: "wont_fix",
        }),
      }),
    );
    expect(screen.queryByText("TOP-3")).not.toBeInTheDocument();
  });

  it("requires a resolution outcome before resolving a single item", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(
      <TriageWorkspace
        initialQueue={[{ ...queue[2] }]}
        flakeHints={[]}
      />,
    );

    await user.click(screen.getByRole("button", { name: /^Resolve$/i }));
    expect(fetchMock).not.toHaveBeenCalled();
    await user.selectOptions(
      screen.getByRole("combobox", { name: /Resolution outcome/i }),
      "duplicate",
    );
    await user.click(screen.getByRole("button", { name: /Confirm resolve/i }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/triage",
      expect.objectContaining({
        body: JSON.stringify({
          id: queue[2].id,
          status: "resolved",
          resolution: "duplicate",
        }),
      }),
    );
  });

  it("labels heuristic cluster summaries as a local template", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: "Both checkouts time out waiting on the payment iframe.",
        heuristic: true,
        model: "heuristic",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TriageWorkspace initialQueue={queue} flakeHints={[]} />);

    await user.click(
      screen.getByRole("button", { name: /Summarize cluster/i }),
    );

    expect(
      await screen.findByText(
        /Local template — connect an AI provider in Settings for tailored drafts/i,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Both checkouts time out waiting on the payment iframe\./i,
      ),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/ai/draft?heuristic=1",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("labels model-backed cluster summaries with the model name", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        summary: "Shared payment iframe flake across browsers.",
        heuristic: false,
        model: "gpt-4.1-mini",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<TriageWorkspace initialQueue={queue} flakeHints={[]} />);

    await user.click(
      screen.getByRole("button", { name: /Summarize cluster/i }),
    );

    expect(
      await screen.findByText(/Drafted with gpt-4\.1-mini/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Shared payment iframe flake across browsers\./i),
    ).toBeInTheDocument();
  });

  it("files issues for every result in a signature cluster", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const clustered = [
      { ...queue[0], resultId: "result-a" },
      { ...queue[1], resultId: "result-b" },
    ];

    render(
      <TriageWorkspace
        initialQueue={clustered}
        flakeHints={[]}
        issueProvider="mock"
        demoMode
      />,
    );

    await user.click(
      screen.getByRole("button", { name: /File issues for cluster/i }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/issues",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "create",
          resultId: "result-a",
          provider: "mock",
        }),
      }),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/issues",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          action: "create",
          resultId: "result-b",
          provider: "mock",
        }),
      }),
    );
    expect(screen.queryByText("TOP-1")).not.toBeInTheDocument();
    expect(screen.queryByText("TOP-2")).not.toBeInTheDocument();
  });
});
