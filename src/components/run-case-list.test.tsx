import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunCaseList } from "./run-case-list";
import type { ResultRow } from "./run-executor-model";

afterEach(() => {
  cleanup();
});

function row(
  id: string,
  status: string,
  key: string,
  title: string,
  assigneeId: string | null = null,
): ResultRow {
  return {
    id,
    status,
    notes: "",
    assigneeId,
    linkedIssues: [],
    comments: [],
    attachments: [],
    case: { id, key, title, steps: "", expectedResult: "" },
  };
}

const results = [
  row("r1", "untested", "CASE-1", "Alpha"),
  row("r2", "failed", "CASE-2", "Bravo", "user-1"),
];

describe("RunCaseList", () => {
  it("renders keys, titles, assignees, and filter chips", () => {
    render(
      <RunCaseList
        results={results}
        filtered={results}
        focusedId="r1"
        members={[{ id: "user-1", name: "Ada", email: "ada@test" }]}
        statusFilter="all"
        mineOnly={false}
        query=""
        currentUserId="user-1"
        onStatusFilter={vi.fn()}
        onMineOnly={vi.fn()}
        onQueryChange={vi.fn()}
        onSelect={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "CASE-1 Alpha" })).toHaveAttribute(
      "aria-current",
      "true",
    );
    expect(screen.getByText("Ada")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Untested" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Failed" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Blocked" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mine" })).toBeInTheDocument();
  });

  it("notifies when a filter chip or row is pressed", async () => {
    const user = userEvent.setup();
    const onStatusFilter = vi.fn();
    const onSelect = vi.fn();

    render(
      <RunCaseList
        results={results}
        filtered={results}
        focusedId="r1"
        members={[]}
        statusFilter="all"
        mineOnly={false}
        query=""
        onStatusFilter={onStatusFilter}
        onMineOnly={vi.fn()}
        onQueryChange={vi.fn()}
        onSelect={onSelect}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Failed" }));
    expect(onStatusFilter).toHaveBeenCalledWith("failed");
    await user.click(screen.getByRole("button", { name: "CASE-2 Bravo" }));
    expect(onSelect).toHaveBeenCalledWith("r2");
  });
});
