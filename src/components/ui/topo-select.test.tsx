import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { TopoSelect } from "./topo-select";

afterEach(() => {
  cleanup();
});

const options = [
  { id: "draft", label: "Draft" },
  { id: "ready", label: "Ready" },
];

describe("TopoSelect", () => {
  it("renders the selected value and calls onChange when an option is chosen", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TopoSelect
        ariaLabel="Status"
        value="draft"
        onChange={onChange}
        options={options}
      />,
    );

    // HeroUI composes value text into the accessible name (e.g. "Draft Status").
    const trigger = screen.getByRole("button", { name: /Status/ });
    expect(trigger).toHaveAttribute("aria-label", "Status");
    expect(trigger).toHaveTextContent("Draft");
    await user.click(trigger);
    await user.click(await screen.findByRole("option", { name: "Ready" }));
    expect(onChange).toHaveBeenCalledWith("ready");
  });

  it("lazy mode mounts a stub trigger until interaction, then opens the listbox", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <TopoSelect
        ariaLabel="Priority"
        value="draft"
        onChange={onChange}
        options={options}
        lazy
        compact
      />,
    );

    const trigger = screen.getByRole("button", { name: "Priority" });
    expect(trigger).toHaveAttribute("aria-haspopup", "listbox");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();

    await user.click(trigger);
    expect(await screen.findByRole("option", { name: "Ready" })).toBeInTheDocument();
    await user.click(screen.getByRole("option", { name: "Ready" }));
    expect(onChange).toHaveBeenCalledWith("ready");
  });
});
