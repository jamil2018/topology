"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { SavedViewsBar, type SavedViewRow } from "./saved-views-bar";
import { StatusChip, statusToneForRun } from "./status-chip";
import {
  filterAndSortRuns,
  paginateRuns,
  RUN_LIST_PAGE_SIZE,
  type RunListSort,
} from "@/lib/run-list";
import { parseRunViewConfig } from "@/lib/saved-views";

type RunRow = {
  id: string;
  name: string;
  status: string;
  environment: string;
  createdAt?: string | Date;
  updatedAt: string | Date;
};

const runListSorts: { id: RunListSort; label: string }[] = [
  { id: "updated", label: "Updated" },
  { id: "created", label: "Created" },
  { id: "name", label: "Name" },
  { id: "status", label: "Status" },
];

export function RunsWorkspace({
  initialRuns,
  initialViews = [],
}: {
  initialRuns: RunRow[];
  initialViews?: SavedViewRow[];
}) {
  const [runSearch, setRunSearch] = useState("");
  const [runSort, setRunSort] = useState<RunListSort>("updated");
  const [runPage, setRunPage] = useState(1);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const filteredRuns = useMemo(
    () => filterAndSortRuns(initialRuns, runSearch, runSort),
    [initialRuns, runSearch, runSort],
  );

  const runPageData = useMemo(
    () => paginateRuns(filteredRuns, runPage, RUN_LIST_PAGE_SIZE),
    [filteredRuns, runPage],
  );

  const showRunListPagination = runPageData.total > RUN_LIST_PAGE_SIZE;

  function applyRunView(view: SavedViewRow) {
    const config = parseRunViewConfig(JSON.stringify(view.config));
    setRunSearch(config.search);
    setRunSort(config.sort);
    setRunPage(1);
    setActiveViewId(view.id);
  }

  const runRangeStart =
    runPageData.total === 0
      ? 0
      : (runPageData.page - 1) * RUN_LIST_PAGE_SIZE + 1;
  const runRangeEnd = Math.min(
    runPageData.page * RUN_LIST_PAGE_SIZE,
    runPageData.total,
  );

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manual"
        title="Test Runs"
        description="Plan a pass, attach ready cases, and record results as you execute."
        meta={<StatusChip mono>{initialRuns.length} runs</StatusChip>}
        actions={
          <Link
            href="/runs/new"
            className="inline-flex h-9 items-center justify-center rounded-md bg-[color:var(--topo-ink)] px-3 text-sm font-medium text-[color:var(--topo-panel)] transition active:scale-[0.98]"
          >
            Start a run
          </Link>
        }
      />

      <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {initialRuns.length > 0 ? (
          <div className="space-y-2 border-b border-[color:var(--topo-line)] p-2.5">
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
              <TextField name="run-list-search" className="min-w-0 flex-1">
                <Label className="sr-only">Search runs</Label>
                <Input
                  aria-label="Search runs"
                  placeholder="Search name, id, or status"
                  value={runSearch}
                  onChange={(e) => {
                    setActiveViewId(null);
                    setRunSearch(e.target.value);
                    setRunPage(1);
                  }}
                  className="w-full"
                />
              </TextField>
              <div className="flex items-center gap-1.5">
                <span
                  id="run-list-sort-label"
                  className="shrink-0 text-xs text-[color:var(--topo-muted)]"
                >
                  Sort
                </span>
                <Select
                  aria-labelledby="run-list-sort-label"
                  className="w-[9.5rem] shrink-0"
                  variant="secondary"
                  placeholder="Updated"
                  value={runSort}
                  onChange={(value) => {
                    if (value == null) return;
                    setActiveViewId(null);
                    setRunSort(String(value) as RunListSort);
                    setRunPage(1);
                  }}
                >
                  <Select.Trigger className="h-9 min-h-9 py-0 md:h-8 md:min-h-8">
                    <Select.Value className="text-center" />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {runListSorts.map((s) => (
                        <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                          {s.label}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>
            </div>
            <SavedViewsBar
              entity="runs"
              initialViews={initialViews}
              activeViewId={activeViewId}
              canSave
              buildConfig={() => ({ search: runSearch, sort: runSort })}
              onApply={applyRunView}
              onSaved={(view) => setActiveViewId(view.id)}
            />
          </div>
        ) : null}

        {initialRuns.length === 0 ? (
          <div className="space-y-3 border-dashed px-3 py-10 text-center">
            <p className="text-sm text-[color:var(--topo-muted)]">No runs yet.</p>
            <Link
              href="/runs/new"
              className="inline-flex h-9 items-center justify-center rounded-md bg-[color:var(--topo-ink)] px-3 text-sm font-medium text-[color:var(--topo-panel)] transition active:scale-[0.98]"
            >
              Start a run
            </Link>
          </div>
        ) : runPageData.items.length === 0 ? (
          <p className="px-3 py-10 text-center text-sm text-[color:var(--topo-muted)]">
            No runs match this search.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {runPageData.items.map((run, i) => (
              <motion.li
                key={run.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
              >
                <Link
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 transition-colors hover:bg-[color:var(--topo-chip)]/50"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[color:var(--topo-ink)]">
                      {run.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--topo-muted)]">
                      <span className="font-mono">{run.id.slice(0, 8)}</span>
                      <span>{run.environment}</span>
                    </div>
                  </div>
                  <StatusChip tone={statusToneForRun(run.status)} mono>
                    {run.status.replace("_", " ")}
                  </StatusChip>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}

        {showRunListPagination ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--topo-line)] px-2.5 py-2">
            <p className="text-xs text-[color:var(--topo-muted)]">
              {runRangeStart}–{runRangeEnd} of {runPageData.total}
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                size="sm"
                variant="secondary"
                isDisabled={runPageData.page <= 1}
                onPress={() => setRunPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="secondary"
                isDisabled={runPageData.page >= runPageData.totalPages}
                onPress={() =>
                  setRunPage((p) => Math.min(runPageData.totalPages, p + 1))
                }
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
