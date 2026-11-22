import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { TopoSearchField } from "./topo-search-field";

afterEach(() => {
  cleanup();
});

describe("TopoSearchField", () => {
  it("updates value through onChange and clears via the clear control", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onClear = vi.fn();
    render(
      <TopoSearchField
        ariaLabel="Search cases"
        value="checkout"
        onChange={onChange}
        onClear={onClear}
        placeholder="Search…"
      />,
    );

    const input = screen.getByRole("searchbox", { name: "Search cases" });
    expect(input).toHaveValue("checkout");

    await user.type(input, "x");
    expect(onChange).toHaveBeenCalled();

    // HeroUI SearchField.ClearButton exposes aria-label "Close".
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClear).toHaveBeenCalled();
  });
});
