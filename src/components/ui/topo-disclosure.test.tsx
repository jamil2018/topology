import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { TopoDisclosure } from "./topo-disclosure";

afterEach(() => {
  cleanup();
});

describe("TopoDisclosure", () => {
  it("expands to reveal body content and reports expanded state", async () => {
    const user = userEvent.setup();
    const onExpandedChange = vi.fn();
    const { container } = render(
      <TopoDisclosure
        id="ci"
        title="Filter and sort"
        summary="3 active"
        onExpandedChange={onExpandedChange}
      >
        <p>Filter body</p>
      </TopoDisclosure>,
    );

    expect(container.querySelector("#ci")).not.toBeNull();
    const trigger = screen.getByRole("button", { name: /Filter and sort/i });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/3 active/)).toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Filter body")).toBeVisible();
    expect(onExpandedChange).toHaveBeenCalledWith(true);
  });
});
