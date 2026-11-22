"use client";

import { memo, useCallback, useMemo } from "react";
import type { Selection } from "@heroui/react";
import { Button, Chip } from "@heroui/react";
import { useLatestRef } from "@/lib/use-latest-ref";
import { StatusChip } from "./status-chip";
import { TopoCheckbox } from "./ui/topo-checkbox";
import { TopoDisclosure } from "./ui/topo-disclosure";
import { TopoSearchField } from "./ui/topo-search-field";
import { TopoSelect } from "./ui/topo-select";
import {
  RUN_CASE_ROW_HEIGHT,
  useVirtualWindow,
} from "./run-virtual-list";
import type { CasePickerSort, PickerCase } from "@/lib/run-case-picker";

type Folder = { id: string; name: string };

const statuses = ["all", "draft", "ready", "blocked", "deprecated"] as const;
const priorities = ["all", "P0", "P1", "P2", "P3"] as const;
const sorts: { id: CasePickerSort; label: string }[] = [
  { id: "updated", label: "Updated" },
  { id: "created", label: "Created" },
  { id: "title", label: "Title" },
  { id: "priority", label: "Priority" },
  { id: "status", label: "Status" },
];

const statusOptions = statuses.map((s) => ({
  id: s,
  label: s === "all" ? "All statuses" : s,
}));
const priorityOptions = priorities.map((p) => ({
  id: p,
  label: p === "all" ? "All priorities" : p,
}));
const sortOptions = sorts.map((s) => ({ id: s.id, label: s.label }));

const PICKER_ROW_HEIGHT = RUN_CASE_ROW_HEIGHT;

const PickerRow = memo(function PickerRow({
  row,
  selected,
  onToggle,
}: {
  row: PickerCase;
  selected: boolean;
  onToggle: (id: string, checked: boolean) => void;
}) {
  return (
    <div
      className="grid grid-cols-[2.5rem_minmax(0,1.6fr)_5.5rem_4.5rem_5rem_minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-2 border-b border-[color:var(--topo-line)] px-2.5 text-sm"
      style={{ height: PICKER_ROW_HEIGHT }}
      role="row"
    >
      <div role="cell" className="flex items-center justify-center">
        <TopoCheckbox
          aria-label={`Select ${row.title}`}
          isSelected={selected}
          onChange={(checked) => onToggle(row.id, checked)}
          compact
        />
      </div>
      <div role="cell" className="min-w-0">
        <span className="block truncate font-medium text-[color:var(--topo-ink)]">
          {row.title}
        </span>
      </div>
      <div role="cell">
        <span className="font-mono text-xs text-[color:var(--topo-muted)]">
          {row.key}
        </span>
      </div>
      <div role="cell">
        <StatusChip mono>{row.priority}</StatusChip>
      </div>
      <div role="cell">
        <StatusChip mono>{row.status}</StatusChip>
      </div>
      <div role="cell" className="min-w-0">
        <span className="block truncate text-xs text-[color:var(--topo-muted)]">
          {row.folder?.name ?? "—"}
        </span>
      </div>
      <div role="cell" className="min-w-0">
        <div className="flex flex-wrap gap-1">
          {(row.tags ?? []).length === 0 ? (
            <span className="text-xs text-[color:var(--topo-muted)]">—</span>
          ) : (
            (row.tags ?? []).slice(0, 4).map((t) => (
              <Chip key={t} size="sm" variant="soft">
                {t}
              </Chip>
            ))
          )}
        </div>
      </div>
    </div>
  );
});

export function RunCasePickerTable({
  visible,
  folders,
  tags,
  search,
  status,
  priority,
  folderId,
  tag,
  sort,
  selectedIds,
  onSearchChange,
  onStatusChange,
  onPriorityChange,
  onFolderChange,
  onTagChange,
  onSortChange,
  onSelectionChange,
  onResetToReady,
}: {
  visible: PickerCase[];
  folders: Folder[];
  tags: string[];
  search: string;
  status: string;
  priority: string;
  folderId: string;
  tag: string;
  sort: CasePickerSort;
  selectedIds: Set<string>;
  onSearchChange: (value: string) => void;
  onStatusChange: (value: string) => void;
  onPriorityChange: (value: string) => void;
  onFolderChange: (value: string) => void;
  onTagChange: (value: string) => void;
  onSortChange: (value: CasePickerSort) => void;
  onSelectionChange: (keys: Selection) => void;
  onResetToReady: () => void;
}) {
  const visibleIds = useMemo(() => visible.map((c) => c.id), [visible]);
  const selectedCount = selectedIds.size;
  const hiddenSelected =
    selectedCount - visibleIds.filter((id) => selectedIds.has(id)).length;
  const selectedVisibleCount = visibleIds.filter((id) =>
    selectedIds.has(id),
  ).length;
  const allVisibleSelected =
    visibleIds.length > 0 && selectedVisibleCount === visibleIds.length;
  const someVisibleSelected =
    selectedVisibleCount > 0 && !allVisibleSelected;

  const folderOptions = useMemo(
    () => [
      { id: "all", label: "All folders" },
      ...folders.map((f) => ({ id: f.id, label: f.name })),
    ],
    [folders],
  );
  const tagOptions = useMemo(
    () => [
      { id: "all", label: "All tags" },
      ...tags.map((t) => ({ id: t, label: t })),
    ],
    [tags],
  );

  const filterSummary = useMemo(() => {
    const parts = [
      status === "all" ? "All statuses" : `${status} cases`,
      priority !== "all" ? priority : null,
      folderId !== "all"
        ? (folders.find((folder) => folder.id === folderId)?.name ?? "Folder")
        : null,
      tag !== "all" ? tag : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }, [status, priority, folderId, tag, folders]);

  const { setParent, start, end, totalHeight, offsetY } = useVirtualWindow({
    count: visible.length,
    rowHeight: PICKER_ROW_HEIGHT,
  });
  const windowRows = visible.slice(start, end);

  // rerender-functional-setstate / rerender-use-ref-transient-values:
  // keep onToggle stable so memoized PickerRow siblings skip re-render.
  const selectedIdsRef = useLatestRef(selectedIds);
  const onToggleRow = useCallback(
    (id: string, checked: boolean) => {
      const next = new Set(selectedIdsRef.current);
      if (checked) next.add(id);
      else next.delete(id);
      onSelectionChange(next);
    },
    [onSelectionChange, selectedIdsRef],
  );

  const onToggleAllVisible = useCallback(
    (checked: boolean) => {
      onSelectionChange(checked ? "all" : new Set());
    },
    [onSelectionChange],
  );

  const clearFilters = useCallback(() => {
    onSearchChange("");
    onStatusChange("all");
    onPriorityChange("all");
    onFolderChange("all");
    onTagChange("all");
  }, [onSearchChange, onStatusChange, onPriorityChange, onFolderChange, onTagChange]);

  const hasFilters =
    search ||
    status !== "all" ||
    priority !== "all" ||
    folderId !== "all" ||
    tag !== "all";

  return (
    <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
      <div className="space-y-3 border-b border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/30 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-medium text-[color:var(--topo-ink)]">
            Cases for this run
          </div>
          <StatusChip mono>
            {selectedCount} selected · {visible.length} visible
          </StatusChip>
        </div>

        <TopoSearchField
          label="Search cases"
          name="case-search"
          ariaLabel="Search cases"
          placeholder="Search by title, key, or tag"
          value={search}
          onChange={onSearchChange}
          onClear={() => onSearchChange("")}
        />

        {hiddenSelected > 0 ? (
          <p role="status" className="text-sm">
            {hiddenSelected} selected cases are outside these filters and will
            still be included.
          </p>
        ) : null}
        {hasFilters ? (
          <Button size="sm" variant="tertiary" onPress={clearFilters}>
            Clear filters
          </Button>
        ) : null}

        <TopoDisclosure
          bordered
          title="Filter and sort cases"
          summary={`· ${filterSummary}`}
          bodyClassName="space-y-3 pt-2"
        >
          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <TopoSelect
              label="Status"
              className="w-full"
              value={status}
              onChange={onStatusChange}
              options={statusOptions}
              compact
            />
            <TopoSelect
              label="Priority"
              className="w-full"
              value={priority}
              onChange={onPriorityChange}
              options={priorityOptions}
              compact
            />
            <TopoSelect
              label="Folder / suite"
              className="w-full"
              value={folderId}
              onChange={onFolderChange}
              options={folderOptions}
              compact
            />
            <TopoSelect
              label="Tag"
              className="w-full"
              value={tag}
              onChange={onTagChange}
              options={tagOptions}
              compact
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[color:var(--topo-line)] pt-3">
            <TopoSelect
              label="Sort"
              className="w-[9.5rem]"
              value={sort}
              onChange={(value) => onSortChange(value as CasePickerSort)}
              options={sortOptions}
              compact
            />
            <div role="group" aria-label="Case selection">
              <Button size="sm" variant="tertiary" onPress={onResetToReady}>
                Reset to all ready
              </Button>
            </div>
          </div>
        </TopoDisclosure>
      </div>

      <div
        className="min-w-0 overflow-x-auto"
        role="table"
        aria-label="Cases for this run"
      >
        <div
          className="grid min-w-[720px] grid-cols-[2.5rem_minmax(0,1.6fr)_5.5rem_4.5rem_5rem_minmax(0,0.9fr)_minmax(0,1fr)] items-center gap-2 border-b border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/20 px-2.5 py-2 text-xs font-medium text-[color:var(--topo-muted)]"
          role="row"
        >
          <div role="columnheader" className="flex items-center justify-center">
            <TopoCheckbox
              aria-label="Select all visible cases"
              isSelected={allVisibleSelected}
              isIndeterminate={someVisibleSelected}
              onChange={onToggleAllVisible}
              compact
            />
          </div>
          <div role="columnheader">Title</div>
          <div role="columnheader">Key</div>
          <div role="columnheader">Priority</div>
          <div role="columnheader">Status</div>
          <div role="columnheader">Folder</div>
          <div role="columnheader">Tags</div>
        </div>

        <div
          ref={setParent}
          className="max-h-64 min-w-[720px] overflow-y-auto"
          role="rowgroup"
        >
          {visible.length === 0 ? (
            <div className="flex min-h-32 items-center justify-center px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
              No cases match these filters.
            </div>
          ) : (
            <div style={{ height: totalHeight, position: "relative" }}>
              <div style={{ transform: `translateY(${offsetY}px)` }}>
                {windowRows.map((row) => (
                  <PickerRow
                    key={row.id}
                    row={row}
                    selected={selectedIds.has(row.id)}
                    onToggle={onToggleRow}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/20 px-2.5 py-2 text-xs text-[color:var(--topo-muted)]">
        <span>
          {selectedCount} selected · {visible.length} visible
        </span>
        <span className="font-medium">Select at least one case</span>
      </div>
    </div>
  );
}
