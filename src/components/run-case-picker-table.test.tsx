import { describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { afterEach } from "vitest";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { RunCasePickerTable } from "./run-case-picker-table";
import type { PickerCase } from "@/lib/run-case-picker";
import { RUN_CASE_ROW_HEIGHT } from "./run-virtual-list";

afterEach(() => {
  cleanup();
});

function makeCase(index: number): PickerCase {
  return {
    id: `11111111-1111-1111-1111-${String(index).padStart(12, "0")}`,
    key: `TOP-${index}`,
    title: `Case title ${index}`,
    priority: "P1",
    status: "ready",
    tags: index % 2 === 0 ? ["smoke"] : [],
    folder: { id: "f1", name: "Smoke" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  };
}

function renderPicker(visible: PickerCase[]) {
  return render(
    <RunCasePickerTable
      visible={visible}
      folders={[{ id: "f1", name: "Smoke" }]}
      tags={["smoke"]}
      search=""
      status="all"
      priority="all"
      folderId="all"
      tag="all"
      sort="updated"
      selectedIds={new Set()}
      onSearchChange={vi.fn()}
      onStatusChange={vi.fn()}
      onPriorityChange={vi.fn()}
      onFolderChange={vi.fn()}
      onTagChange={vi.fn()}
      onSortChange={vi.fn()}
      onSelectionChange={vi.fn()}
      onResetToReady={vi.fn()}
    />,
  );
}

describe("RunCasePickerTable", () => {
  it("renders Filter and sort cases as a Disclosure with spaced filter controls", async () => {
    const user = userEvent.setup();
    renderPicker([makeCase(0)]);

    const trigger = screen.getByRole("button", {
      name: /Filter and sort cases/i,
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    expect(screen.getByLabelText("Status")).toBeInTheDocument();
    expect(screen.getByLabelText("Priority")).toBeInTheDocument();
    expect(screen.getByLabelText("Folder / suite")).toBeInTheDocument();
    expect(screen.getByLabelText("Tag")).toBeInTheDocument();
    expect(screen.getByLabelText("Sort")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reset to all ready" }),
    ).toBeInTheDocument();
  });

  it("virtualizes large case lists instead of mounting every row", () => {
    const cases = Array.from({ length: 80 }, (_, i) => makeCase(i));
    renderPicker(cases);

    const table = screen.getByRole("table", { name: "Cases for this run" });
    const rowgroup = within(table).getByRole("rowgroup");
    expect(within(rowgroup).getByText("TOP-0")).toBeInTheDocument();
    expect(within(rowgroup).queryByText("TOP-79")).not.toBeInTheDocument();

    const spacer = rowgroup.querySelector(
      '[style*="height"]',
    ) as HTMLElement | null;
    expect(spacer?.style.height).toBe(`${80 * RUN_CASE_ROW_HEIGHT}px`);
  });
});
