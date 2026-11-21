"use client";

import { useEffect } from "react";
import {
  countResultStatuses,
  memberLabel,
  RESULT_STATUSES,
  type MemberOption,
  type ResultRow,
  type StatusFilter,
} from "./run-executor-model";
import { statusChipHint, statusDotClass } from "./run-status-styles";
import {
  RUN_CASE_ROW_HEIGHT,
  scrollIndexIntoView,
  useVirtualWindow,
} from "./run-virtual-list";
import { formatStatusLabel } from "@/lib/format-labels";

const STATUS_CHIPS: { id: Exclude<StatusFilter, "all">; label: string }[] = [
  { id: "untested", label: "Untested" },
  { id: "passed", label: "Passed" },
  { id: "failed", label: "Failed" },
  { id: "blocked", label: "Blocked" },
  { id: "skipped", label: "Skipped" },
];

function chipClass(active: boolean): string {
  return `rounded-md px-2 py-1 text-xs font-medium transition ${
    active
      ? "bg-[color:var(--topo-panel)] text-[color:var(--topo-ink)] shadow-sm"
      : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
  }`;
}

export function RunCaseList({
  results,
  filtered,
  focusedId,
  members,
  statusFilter,
  mineOnly,
  query,
  currentUserId,
  selectedIds,
  selectionEnabled = false,
  bulkPending = false,
  onStatusFilter,
  onMineOnly,
  onQueryChange,
  onSelect,
  onToggleSelected,
  onSelectFiltered,
  onClearSelection,
  onBulkStatus,
  onBulkAssignee,
}: {
  results: ResultRow[];
  filtered: ResultRow[];
  focusedId: string | null;
  members: MemberOption[];
  statusFilter: StatusFilter;
  mineOnly: boolean;
  query: string;
  currentUserId?: string | null;
  selectedIds?: Set<string>;
  selectionEnabled?: boolean;
  bulkPending?: boolean;
  onStatusFilter: (status: StatusFilter) => void;
  onMineOnly: (mine: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelect: (resultId: string) => void;
  onToggleSelected?: (resultId: string) => void;
  onSelectFiltered?: () => void;
  onClearSelection?: () => void;
  onBulkStatus?: (status: string) => void;
  onBulkAssignee?: (assigneeId: string | null) => void;
}) {
  const counts = countResultStatuses(results);
  const mineCount = currentUserId
    ? results.filter((row) => row.assigneeId === currentUserId).length
    : 0;
  const { setParent, parent, start, end, totalHeight } = useVirtualWindow({
    count: filtered.length,
    rowHeight: RUN_CASE_ROW_HEIGHT,
  });
  const focusedIndex = filtered.findIndex((row) => row.id === focusedId);
  const selected = selectedIds ?? new Set<string>();
  const selectedCount = selected.size;
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((row) => selected.has(row.id));

  useEffect(() => {
    scrollIndexIntoView(parent, focusedIndex, RUN_CASE_ROW_HEIGHT);
  }, [focusedIndex, parent]);

  const visible = filtered.slice(start, end);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="space-y-2 border-b border-[color:var(--topo-line)] p-2.5">
        <input
          type="search"
          aria-label="Search cases"
          placeholder="Search key or title"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          className="w-full rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
        />
        <div
          className="flex flex-wrap gap-1 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] p-1"
          role="group"
          aria-label="Filter cases"
        >
          <button type="button" aria-pressed={statusFilter === "all"} onClick={() => onStatusFilter("all")} className={chipClass(statusFilter === "all")}>All {results.length}</button>
          {STATUS_CHIPS.map((chip) => {
            const active = statusFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                aria-label={`${chip.label} ${counts[chip.id]}`}
                onClick={() => onStatusFilter(active ? "all" : chip.id)}
                className={chipClass(active)}
              >
                {chip.label}{" "}
                <span
                  aria-hidden
                  className="ml-1 font-mono text-xs text-[color:var(--topo-muted)]"
                >
                  {counts[chip.id]}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={mineOnly}
            aria-label={`Mine ${mineCount}`}
            onClick={() => onMineOnly(!mineOnly)}
            className={chipClass(mineOnly)}
          >
            Mine{" "}
            <span
              aria-hidden
              className="ml-1 font-mono text-xs text-[color:var(--topo-muted)]"
            >
              {mineCount}
            </span>
          </button>
        </div>
        {selectionEnabled ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 text-xs text-[color:var(--topo-muted)]">
              <input
                type="checkbox"
                checked={allFilteredSelected}
                disabled={filtered.length === 0 || bulkPending}
                aria-label="Select all filtered cases"
                onChange={() => {
                  if (allFilteredSelected) onClearSelection?.();
                  else onSelectFiltered?.();
                }}
                className="accent-[color:var(--topo-accent)]"
              />
              Select filtered
            </label>
            {selectedCount > 0 ? (
              <span className="font-mono text-xs text-[color:var(--topo-muted)]">
                {selectedCount} selected
              </span>
            ) : null}
          </div>
        ) : null}
        {selectionEnabled && selectedCount > 0 ? (
          <div
            className="flex flex-wrap items-center gap-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-accent-soft)] px-2 py-1.5"
            role="toolbar"
            aria-label="Bulk result updates"
          >
            <select
              aria-label="Bulk status"
              disabled={bulkPending}
              defaultValue=""
              className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-xs text-[color:var(--topo-ink)] accent-[color:var(--topo-accent)]"
              onChange={(e) => {
                const value = e.target.value;
                e.target.value = "";
                if (value) onBulkStatus?.(value);
              }}
            >
              <option value="">Status…</option>
              {RESULT_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {formatStatusLabel(status)}
                </option>
              ))}
            </select>
            <select
              aria-label="Bulk assignee"
              disabled={bulkPending}
              defaultValue=""
              className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1 text-xs text-[color:var(--topo-ink)] accent-[color:var(--topo-accent)]"
              onChange={(e) => {
                const value = e.target.value;
                e.target.value = "";
                if (value === "") return;
                onBulkAssignee?.(value === "__none__" ? null : value);
              }}
            >
              <option value="">Assignee…</option>
              <option value="__none__">Unassigned</option>
              {members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name ?? member.email}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={bulkPending}
              onClick={() => onClearSelection?.()}
              className="text-xs text-[color:var(--topo-muted)] underline hover:text-[color:var(--topo-ink)]"
            >
              Clear
            </button>
          </div>
        ) : null}
      </div>

      <div ref={setParent} className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-sm text-[color:var(--topo-muted)]">
            No cases match these filters.
            <button type="button" className="mt-2 block underline" onClick={() => { onStatusFilter("all"); onMineOnly(false); onQueryChange(""); }}>Clear filters</button>
          </p>
        ) : (
          <ul
            aria-label="Run cases"
            className="relative m-0 list-none p-0"
            style={{ height: totalHeight }}
          >
            {visible.map((result, offset) => {
              const index = start + offset;
              const focused = result.id === focusedId;
              const checked = selected.has(result.id);
              const assignee = memberLabel(members, result.assigneeId);
              return (
                <li
                  key={result.id}
                  className="absolute right-0 left-0"
                  style={{
                    top: index * RUN_CASE_ROW_HEIGHT,
                    height: RUN_CASE_ROW_HEIGHT,
                  }}
                >
                  <div
                    className={`flex h-full w-full items-start gap-1.5 px-2 py-1.5 transition ${
                      focused
                        ? "bg-[color:var(--topo-accent-soft)]/40"
                        : "hover:bg-[color:var(--topo-chip)]/50"
                    }`}
                  >
                    {selectionEnabled ? (
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={bulkPending}
                        aria-label={`Select ${result.case.key}`}
                        className="mt-1.5 accent-[color:var(--topo-accent)]"
                        onChange={() => onToggleSelected?.(result.id)}
                        onClick={(e) => e.stopPropagation()}
                      />
                    ) : null}
                    <button
                      type="button"
                      aria-current={focused ? "true" : undefined}
                      onClick={() => onSelect(result.id)}
                      className="flex min-w-0 flex-1 items-start gap-2 text-left"
                    >
                      <span
                        aria-hidden
                        title={statusChipHint(result.status)}
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotClass(result.status)}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-mono text-xs text-[color:var(--topo-muted)]">
                          {result.case.key}{" "}
                        </span>
                        <span className="block truncate text-sm font-medium text-[color:var(--topo-ink)]">
                          {result.case.title}{" "}
                        </span>
                        <span className="block truncate text-xs text-[color:var(--topo-muted)]">
                          {assignee ?? "Unassigned"}
                          <span className="sr-only"> · {statusChipHint(result.status)}</span>
                        </span>
                      </span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
