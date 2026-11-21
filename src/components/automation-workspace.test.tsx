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
});
