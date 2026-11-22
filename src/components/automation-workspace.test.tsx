import { afterEach, describe, expect, it } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "@/test/render";
import { AutomationWorkspace } from "./automation-workspace";

afterEach(() => {
  cleanup();
});

describe("AutomationWorkspace", () => {
  it("surfaces native reporter copy-paste snippets", () => {
    render(<AutomationWorkspace initialRuns={[]} />);

    expect(screen.getByText("Framework reporters")).toBeInTheDocument();
    expect(screen.getByText("@topology/playwright")).toBeInTheDocument();
    expect(screen.getByText("@topology/jest")).toBeInTheDocument();
    expect(screen.getByText("@topology/cypress")).toBeInTheDocument();
    expect(screen.getByText("pytest-topology")).toBeInTheDocument();
    expect(
      screen.getByText(/reporter: \[\[\"@topology\/playwright\"\], \[\"list\"\]\]/),
    ).toBeInTheDocument();
    expect(screen.getByText(/topologyCypressPlugin/)).toBeInTheDocument();
    expect(screen.getByText(/pip install pytest-topology/)).toBeInTheDocument();
  });

  it("links flake hints to the case and a targeted retest", () => {
    render(
      <AutomationWorkspace
        initialRuns={[]}
        flakeHints={[
          {
            caseId: "case-1",
            caseKey: "TOP-9",
            title: "Flaky checkout",
            score: 0.8,
            hint: "Pass/fail flip across last 5 runs",
          },
        ]}
      />,
    );

    expect(screen.getByRole("link", { name: "TOP-9" })).toHaveAttribute(
      "href",
      "/cases?q=TOP-9",
    );
    expect(screen.getByRole("link", { name: "Retest" })).toHaveAttribute(
      "href",
      "/runs/new?cases=case-1",
    );
  });
});
