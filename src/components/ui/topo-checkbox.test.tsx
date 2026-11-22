import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { TopoCheckbox } from "./topo-checkbox";

afterEach(() => {
  cleanup();
});

describe("TopoCheckbox", () => {
  it("toggles selection and reports the new state", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TopoCheckbox aria-label="Select row" isSelected={false} onChange={onChange} />,
    );

    const checkbox = screen.getByRole("checkbox", { name: "Select row" });
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it("renders labeled children when provided", () => {
    render(
      <TopoCheckbox isSelected defaultSelected>
        Include automation
      </TopoCheckbox>,
    );
    expect(screen.getByText("Include automation")).toBeInTheDocument();
    expect(screen.getByRole("checkbox")).toBeChecked();
  });
});
