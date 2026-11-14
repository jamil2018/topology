import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { ShortcutLayer } from "./shortcut-layer";

const push = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn() }),
  usePathname: () => "/reports",
}));

vi.mock("./command-palette", () => ({
  openCommandPalette: vi.fn(),
}));

afterEach(() => {
  cleanup();
  push.mockClear();
});

describe("ShortcutLayer", () => {
  it("opens the cheat sheet from ? and closes from Escape", async () => {
    const user = userEvent.setup();
    render(<ShortcutLayer />);

    await user.keyboard("?");
    expect(
      screen.getByRole("dialog", { name: "Keyboard shortcuts" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Pass result")).toBeInTheDocument();
    expect(screen.getByText("Toggle sidebar")).toBeInTheDocument();
    expect(screen.getByText("⌘B")).toBeInTheDocument();
    expect(screen.getByText("Go to test cases")).toBeInTheDocument();

    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Keyboard shortcuts" }),
      ).not.toBeInTheDocument();
    });
  });

  it("ignores create while focus is in an input", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <input aria-label="Title" />
        <ShortcutLayer />
      </div>,
    );

    await user.click(screen.getByLabelText("Title"));
    await user.keyboard("c");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("c");
  });

  it("creates from C when focus is not in a field", async () => {
    const user = userEvent.setup();
    render(<ShortcutLayer />);
    await user.keyboard("c");
    expect(push).toHaveBeenCalledWith("/cases?new=1");
  });

  it("navigates with G then a letter", async () => {
    const user = userEvent.setup();
    render(<ShortcutLayer />);
    await user.keyboard("gc");
    expect(push).toHaveBeenCalledWith("/cases");
    push.mockClear();
    await user.keyboard("gr");
    expect(push).toHaveBeenCalledWith("/runs");
    push.mockClear();
    await user.keyboard("gh");
    expect(push).toHaveBeenCalledWith("/");
  });

  it("ignores the G-then-X chord while typing in an input", async () => {
    const user = userEvent.setup();
    render(
      <div>
        <input aria-label="Title" />
        <ShortcutLayer />
      </div>,
    );

    await user.click(screen.getByLabelText("Title"));
    await user.keyboard("gc");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Title")).toHaveValue("gc");
  });
});

it("does not dispatch create without the required project action", async () => {
  const user = userEvent.setup();
  render(<ShortcutLayer />, { actions: ["cases.view"] });
  await user.keyboard("c");
  expect(push).not.toHaveBeenCalled();
});

it("contains tab focus and returns it to the opener", async () => {
  const user = userEvent.setup();
  render(<><button>Before dialog</button><ShortcutLayer /></>);
  await user.click(screen.getByRole("button", { name: "Before dialog" }));
  await user.keyboard("?");
  const dialog = screen.getByRole("dialog", { name: "Keyboard shortcuts" });
  for (let index = 0; index < 6; index++) { await user.tab(); expect(dialog.contains(document.activeElement)).toBe(true); }
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.getByRole("button", { name: "Before dialog" })).toHaveFocus());
});
