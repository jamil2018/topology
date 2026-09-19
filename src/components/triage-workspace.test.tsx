import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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
}));

describe("TriageWorkspace signature clusters", () => {
  it("shows N → title groups and expands to member failures", async () => {
    const user = userEvent.setup();
    render(<TriageWorkspace initialQueue={queue} flakeHints={[]} />);

    expect(screen.getByText(/2 signatures/i)).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: /2\s*→\s*payment iframe timeout after 1000ms/i,
      }),
    ).toBeInTheDocument();

    // Collapsed cluster hides member case keys until expanded
    expect(screen.queryByText("TOP-2")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /2\s*→\s*payment iframe timeout after 1000ms/i,
      }),
    );

    expect(screen.getByText("TOP-1")).toBeInTheDocument();
    expect(screen.getByText("TOP-2")).toBeInTheDocument();
    // Singleton remains visible without a cluster chrome row
    expect(screen.getByText("TOP-3")).toBeInTheDocument();
  });
});
