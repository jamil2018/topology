import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { FolderTreePane } from "./folder-tree-pane";

afterEach(() => {
  cleanup();
});

const folders = [
  {
    id: "folder-smoke",
    name: "Smoke suite with a long nested label",
    parentId: null,
  },
  { id: "folder-auth", name: "Auth", parentId: "folder-smoke" },
  { id: "folder-billing", name: "Billing", parentId: null },
];

/** Folder row accessible name is label + count; manage/expand actions also include the name. */
const smokeRow = (name: string) =>
  /^Smoke suite with a long nested label\d*$/i.test(name);
const authRow = (name: string) => /^Auth\d*$/i.test(name);
const billingRow = (name: string) => /^Billing\d*$/i.test(name);

function renderTree(
  selected: "all" | "unfiled" | string = "all",
  onSelect = vi.fn(),
) {
  return render(
    <FolderTreePane
      folders={folders}
      folderCounts={
        new Map([
          ["folder-smoke", 3],
          ["folder-auth", 1],
          ["folder-billing", 1],
        ])
      }
      unfiledCount={2}
      totalCount={7}
      selected={selected}
      onSelect={onSelect}
      onCreateRoot={vi.fn()}
      onCreateSubfolder={vi.fn()}
      onRename={vi.fn()}
      onDelete={vi.fn()}
      collapsed={false}
      inline
      onToggleCollapsed={vi.fn()}
    />,
  );
}

describe("FolderTreePane", () => {
  it("reports folder selection and marks aria-current on the active row", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTree("all", onSelect);

    const nav = screen.getByRole("navigation", { name: "Folders" });
    expect(
      within(nav).getByRole("button", { name: /All cases/i }),
    ).toHaveAttribute("aria-current", "true");

    await user.click(within(nav).getByRole("button", { name: smokeRow }));
    expect(onSelect).toHaveBeenCalledWith("folder-smoke");

    // Fresh mount: custom render() wraps a provider, so rerender() alone is unsafe.
    cleanup();
    renderTree("folder-smoke", onSelect);

    const selectedNav = screen.getByRole("navigation", { name: "Folders" });
    expect(
      within(selectedNav).getByRole("button", { current: true }),
    ).toHaveTextContent("Smoke suite with a long nested label");
    expect(
      within(selectedNav).getByRole("button", { name: billingRow }),
    ).not.toHaveAttribute("aria-current");
  });

  it("toggles nested folders and selects a leaf by accessible name", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderTree("all", onSelect);

    const nav = screen.getByRole("navigation", { name: "Folders" });
    // Parents of nested folders start expanded so deep suites are reachable.
    const toggle = within(nav).getByRole("button", {
      name: /Collapse Smoke suite with a long nested label/i,
    });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(within(nav).getByRole("button", { name: authRow })).toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName(
      /Expand Smoke suite with a long nested label/i,
    );
    expect(
      within(nav).queryByRole("button", { name: authRow }),
    ).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(within(nav).getByRole("button", { name: authRow }));
    expect(onSelect).toHaveBeenCalledWith("folder-auth");
  });

  it("wraps long folder labels instead of truncating them", () => {
    renderTree("folder-smoke");

    const nav = screen.getByRole("navigation", { name: "Folders" });
    const selected = within(nav).getByRole("button", { current: true });
    expect(selected).toHaveTextContent("Smoke suite with a long nested label");

    const label = selected.querySelector(".whitespace-normal");
    expect(label).toBeTruthy();
    expect(label?.className).toMatch(/whitespace-normal/);
    expect(label?.className).toMatch(/text-wrap|break-words/);
    expect(label?.className).not.toMatch(/\btruncate\b/);
  });

  it("exposes folder management actions with accessible names", () => {
    renderTree();

    expect(
      screen.getByRole("button", { name: "New folder" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /New subfolder in Smoke suite with a long nested label/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Rename Smoke suite with a long nested label/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Delete Smoke suite with a long nested label/i,
      }),
    ).toBeInTheDocument();
  });
});
