import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen, within } from "@testing-library/react";
import { render } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { selectTopoOption } from "@/test/select-option";
import { CasesTable } from "./cases-table";
import type { CaseRow } from "./cases-model";

afterEach(() => {
  cleanup();
});

const row: CaseRow = {
  id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  key: "TOP-1",
  title: "Checkout persists",
  priority: "P2",
  status: "draft",
  tags: [],
  folder: null,
};

const second: CaseRow = {
  id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  key: "TOP-2",
  title: "Second case",
  priority: "P1",
  status: "ready",
  tags: [],
  folder: null,
};

function renderTable(
  overrides: Partial<Parameters<typeof CasesTable>[0]> = {},
) {
  const onToggleSelect = vi.fn();
  const onInlinePatch = vi.fn();
  render(
    <CasesTable
      cases={[row, second]}
      totalCases={2}
      folders={[]}
      flatFolders={[]}
      search=""
      hasSearch={false}
      matchCount={2}
      sort="key"
      sortDir="asc"
      selectedIds={new Set()}
      allPageSelected={false}
      activeId={null}
      cursorIndex={-1}
      rangeStart={0}
      rangeEnd={0}
      total={2}
      page={1}
      totalPages={1}
      showPagination={false}
      onSearch={vi.fn()}
      onToggleSort={vi.fn()}
      onToggleSelect={onToggleSelect}
      onToggleSelectPage={vi.fn()}
      onOpen={vi.fn()}
      onDelete={vi.fn()}
      onInlinePatch={onInlinePatch}
      onPageChange={vi.fn()}
      {...overrides}
    />,
  );
  return { onToggleSelect, onInlinePatch };
}

describe("CasesTable", () => {
  it("shows an accessible skeleton while loading", () => {
    renderTable({ loading: true, cases: [] });

    expect(
      screen.getByRole("status", { name: "Updating cases" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("status", { name: "Updating cases" }).closest("[aria-busy]"),
    ).toHaveAttribute("aria-busy", "true");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("keeps inline field selects lazy until interaction", () => {
    renderTable();
    const table = screen.getByRole("region", { name: "Case table" });
    const status = within(table).getByRole("button", { name: "Status for TOP-1" });
    expect(status).toHaveAttribute("aria-haspopup", "listbox");
    expect(within(table).queryByRole("option")).not.toBeInTheDocument();
  });

  it("applies an inline status patch through lazy TopoSelect", async () => {
    const user = userEvent.setup();
    const { onInlinePatch } = renderTable();
    const table = screen.getByRole("region", { name: "Case table" });

    await selectTopoOption(user, "Status for TOP-1", "Ready", table);
    expect(onInlinePatch).toHaveBeenCalledWith(row.id, { status: "ready" });
  });

  it("toggles row selection from the desktop table checkbox", async () => {
    const user = userEvent.setup();
    const { onToggleSelect } = renderTable();
    const table = screen.getByRole("region", { name: "Case table" });

    await user.click(within(table).getByRole("checkbox", { name: "Select TOP-2" }));
    expect(onToggleSelect).toHaveBeenCalledWith(second.id);
  });

  it("marks selected rows via aria-checked in the desktop table", () => {
    renderTable({ selectedIds: new Set([second.id]) });
    const table = screen.getByRole("region", { name: "Case table" });
    expect(
      within(table).getByRole("checkbox", { name: "Select TOP-2" }),
    ).toBeChecked();
    expect(
      within(table).getByRole("checkbox", { name: "Select TOP-1" }),
    ).not.toBeChecked();
  });

  it("shows empty folder/search match copy in both layouts", () => {
    renderTable({ cases: [], totalCases: 5, matchCount: 0 });
    expect(
      screen.getAllByText(/No cases match this search or folder/i).length,
    ).toBeGreaterThan(0);
  });
});
