import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReportsWorkspace } from "./reports-workspace";

describe("ReportsWorkspace", () => {
  it("explains that only completed runs produce reports", () => {
    render(<ReportsWorkspace reports={[]} />);
    expect(screen.getByText("No run reports yet")).toBeInTheDocument();
    expect(
      screen.getByText(/Reports appear after a run is completed/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/in-progress/i)).not.toBeInTheDocument();
  });
});
