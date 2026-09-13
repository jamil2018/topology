import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RunExecutor } from "./run-executor";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const baseRun = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Smoke",
  status: "in_progress",
  description: "Check confirm",
  assigneeId: null,
  results: [
    {
      id: "22222222-2222-2222-2222-222222222222",
      status: "passed",
      notes: "",
      assigneeId: null,
      linkedIssues: [],
      comments: [],
      attachments: [],
      case: {
        id: "33333333-3333-3333-3333-333333333333",
        key: "SMOKE-1",
        title: "Loads",
        steps: "",
        expectedResult: "",
      },
    },
  ],
};

describe("RunExecutor complete confirmation", () => {
  it("warns before completing and cancel aborts", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<RunExecutor run={baseRun} />);

    await user.click(screen.getByRole("button", { name: /^Complete$/ }));
    expect(
      screen.getByRole("heading", { name: "Complete this run?" }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Completing is permanent/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Complete this run?" }),
    ).not.toBeInTheDocument();
  });

  it("locks result controls when the run is completed", () => {
    render(
      <RunExecutor
        run={{
          ...baseRun,
          status: "completed",
        }}
      />,
    );
    expect(screen.getByText(/completed and locked/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View report" })).toHaveAttribute(
      "href",
      `/reports/${baseRun.id}`,
    );
    expect(
      screen.queryByRole("button", { name: /^Complete$/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "passed" })).toBeDisabled();
  });
});
