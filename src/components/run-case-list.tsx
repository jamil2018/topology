"use client";

import { useEffect } from "react";
import {
  countResultStatuses,
  memberLabel,
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

const STATUS_CHIPS: { id: Exclude<StatusFilter, "all">; label: string }[] = [
  { id: "untested", label: "Untested" },
  { id: "failed", label: "Failed" },
  { id: "blocked", label: "Blocked" },
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
  onStatusFilter,
  onMineOnly,
  onQueryChange,
  onSelect,
}: {
  results: ResultRow[];
  filtered: ResultRow[];
  focusedId: string | null;
  members: MemberOption[];
  statusFilter: StatusFilter;
  mineOnly: boolean;
  query: string;
  currentUserId?: string | null;
  onStatusFilter: (status: StatusFilter) => void;
  onMineOnly: (mine: boolean) => void;
  onQueryChange: (query: string) => void;
  onSelect: (resultId: string) => void;
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
          {STATUS_CHIPS.map((chip) => {
            const active = statusFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                aria-pressed={active}
                aria-label={chip.label}
                onClick={() => onStatusFilter(active ? "all" : chip.id)}
                className={chipClass(active)}
              >
                {chip.label}
                <span
                  aria-hidden
                  className="ml-1 font-mono text-[10px] text-[color:var(--topo-muted)]"
                >
                  {counts[chip.id]}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            aria-pressed={mineOnly}
            aria-label="Mine"
            onClick={() => onMineOnly(!mineOnly)}
            className={chipClass(mineOnly)}
          >
            Mine
            <span
              aria-hidden
              className="ml-1 font-mono text-[10px] text-[color:var(--topo-muted)]"
            >
              {mineCount}
            </span>
          </button>
        </div>
      </div>

      <div ref={setParent} className="min-h-0 flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="px-3 py-6 text-sm text-[color:var(--topo-muted)]">
            No cases match these filters.
          </p>
        ) : (
          <ul
            aria-label="Run cases"
            className="relative m-0 list-none p-0"
            style={{ height: totalHeight }}
          >
            {visible.map((result, offset) => {
              const index = start + offset;
              const selected = result.id === focusedId;
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
                  <button
                    type="button"
                    aria-label={`${result.case.key} ${result.case.title}`}
                    aria-current={selected ? "true" : undefined}
                    onClick={() => onSelect(result.id)}
                    className={`flex h-full w-full items-start gap-2 px-2.5 py-1.5 text-left transition ${
                      selected
                        ? "bg-[color:var(--topo-accent-soft)]/40"
                        : "hover:bg-[color:var(--topo-chip)]/50"
                    }`}
                  >
                    <span
                      aria-hidden
                      title={statusChipHint(result.status)}
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${statusDotClass(result.status)}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block font-mono text-[11px] text-[color:var(--topo-muted)]">
                        {result.case.key}
                      </span>
                      <span className="block truncate text-sm font-medium text-[color:var(--topo-ink)]">
                        {result.case.title}
                      </span>
                      <span className="block truncate text-[11px] text-[color:var(--topo-muted)]">
                        {assignee ?? "Unassigned"}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
