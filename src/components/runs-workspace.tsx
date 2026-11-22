"use client";
import { formatDateTime } from "@/lib/format-date";
import { RunTemplatesPanel } from "./run-templates-panel";
import { useProjectActions } from "./project-actions";
import { useListPage, useQueryState } from "./use-list-page";
import type { PaginatedList } from "@/lib/list-pagination";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from "@heroui/react";
import { PlayIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { SavedViewsBar, type SavedViewRow } from "./saved-views-bar";
import { RunsListBodySkeleton } from "./skeletons";
import { StatusChip, statusToneForRun } from "./status-chip";
import { TopoSelect } from "./ui/topo-select";
import {
  filterAndSortRuns,
  paginateRuns,
  RUN_LIST_PAGE_SIZE,
  type RunListItem,
  type RunListSort,
} from "@/lib/run-list";
import { parseRunViewConfig } from "@/lib/saved-views";
import { formatStatusLabel } from "@/lib/format-labels";
import { RunProgressBar } from "./run-progress-bar";
import { useShortcut } from "./shortcut-layer";

type RunRow = RunListItem;

function formatWhen(value: string | Date | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return "—";
  return formatDateTime(d);
}

const runListSorts: { id: RunListSort; label: string }[] = [
  { id: "updated", label: "Updated" },
  { id: "created", label: "Created" },
  { id: "name", label: "Name" },
  { id: "status", label: "Status" },
];

export function RunsWorkspace({
  initialRuns,
  initialPage,
  initialViews = [],
}: {
  initialRuns: RunRow[];
  initialPage?: PaginatedList<RunRow>;
  initialViews?: SavedViewRow[];
}) {
  const { can, userId } = useProjectActions();
  const router = useRouter();
  const [runSearch, setRunSearch] = useQueryState("q", "", String, {
    debounceMs: 200,
    replace: true,
  });
  const [runSort, setRunSort] = useQueryState<RunListSort>("sort", "updated", (value) => ["updated", "created", "name", "status"].includes(value) ? value as RunListSort : "updated");
  const [runPage, setRunPage] = useQueryState("page", 1, (value) => Math.max(1, Number(value) || 1), false);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const [status, setStatus] = useQueryState("status", "all", String);
  const [assignee, setAssignee] = useQueryState("assignee", "all", String);
  const [environment, setEnvironment] = useQueryState("environment", "", String);
  const [kind, setKind] = useQueryState("kind", "all", String);
  const hasFilters = Boolean(runSearch || status !== "all" || assignee !== "all" || environment || kind !== "all");
  function clearFilters() {
    setRunSearch(""); setStatus("all"); setAssignee("all"); setEnvironment(""); setKind("all"); setRunPage(1); setActiveViewId(null);
  }
  const query = new URLSearchParams({ q: runSearch, sort: runSort, page: String(runPage), limit: String(RUN_LIST_PAGE_SIZE), status, assignee, environment, kind }).toString();
  const remote = useListPage<RunRow>("/api/runs", query, initialPage, "runs");
  const filteredRuns = useMemo(
    () => filterAndSortRuns(initialRuns, runSearch, runSort),
    [initialRuns, runSearch, runSort],
  );

  const localPage = useMemo(
    () => paginateRuns(filteredRuns, runPage, RUN_LIST_PAGE_SIZE),
    [filteredRuns, runPage],
  );

  const runPageData = remote.data ?? localPage;
  const showRunListPagination = runPageData.total > RUN_LIST_PAGE_SIZE;
  const cursorIndex =
    runPageData.items.length === 0
      ? 0
      : Math.min(cursor, runPageData.items.length - 1);
  const focusedRun = runPageData.items[cursorIndex] ?? null;

  useShortcut(
    "nav-next",
    useCallback(() => {
      setCursor((index) => Math.min(runPageData.items.length - 1, index + 1));
    }, [runPageData.items.length]),
  );
  useShortcut(
    "nav-prev",
    useCallback(() => {
      setCursor((index) => Math.max(0, index - 1));
    }, []),
  );
  useShortcut(
    "open",
    useCallback(() => {
      if (focusedRun) router.push(`/runs/${focusedRun.id}`);
    }, [focusedRun, router]),
  );

  function applyRunView(view: SavedViewRow) {
    const config = parseRunViewConfig(JSON.stringify(view.config));
    setRunSearch(config.search);
    setRunSort(config.sort);
    setStatus(config.status); setAssignee(config.assignee); setEnvironment(config.environment); setKind(config.kind);
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
        eyebrow="Testing"
        title="Test runs"
        description="Start a manual test run or review results from your automation."
        meta={
          <StatusChip mono>
            {runPageData.total} {runPageData.total === 1 ? "run" : "runs"}
          </StatusChip>
        }
        actions={can("runs.create") ?
          <Link
            href="/runs/new"
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[color:var(--topo-accent)] px-3 text-sm font-medium text-[color:var(--accent-foreground)] transition active:scale-[0.98]"
          >
            <PlayIcon size={14} weight="bold" aria-hidden />
            Start a run
          </Link> : undefined
        }
      />

      {remote.error ? <div role="alert" className="topo-feedback">{remote.error} <Button type="button" size="sm" variant="ghost" className="h-auto min-h-0 px-1 py-0 underline" onPress={remote.retry}>Retry</Button></div> : null}
      <div className="topo-toolbar">
        <TopoSelect
          label="Status"
          ariaLabel="Status"
          className="w-36"
          value={status}
          onChange={setStatus}
          options={["all", "planned", "in_progress", "completed", "aborted"].map((value) => ({
            id: value,
            label: formatStatusLabel(value),
          }))}
          compact
        />
        <TopoSelect
          label="Assignee"
          ariaLabel="Assignee"
          className="w-40"
          value={assignee}
          onChange={setAssignee}
          options={[
            { id: "all", label: "Everyone" },
            { id: userId ?? "", label: "Assigned to me" },
            { id: "unassigned", label: "Unassigned" },
          ]}
          compact
        />
        <TopoSelect
          label="Kind"
          ariaLabel="Kind"
          className="w-36"
          value={kind}
          onChange={setKind}
          options={[
            { id: "all", label: "All runs" },
            { id: "manual", label: "Manual" },
            { id: "automation", label: "Automation" },
          ]}
          compact
        />
        <TextField name="environment" className="w-40" variant="secondary">
          <Label className="text-xs text-[color:var(--topo-muted)]">Environment</Label>
          <Input value={environment} placeholder="Any environment" onChange={(e) => setEnvironment(e.target.value)} />
        </TextField>
      </div>
      <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {true ? (
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
              buildConfig={() => ({ search: runSearch, sort: runSort, status, assignee, environment, kind })}
              onApply={applyRunView}
              onSaved={(view) => setActiveViewId(view.id)}
            />
          </div>
        ) : null}

        {remote.loading ? (
          <div role="status" aria-busy="true" aria-label="Updating runs">
            <RunsListBodySkeleton />
          </div>
        ) : runPageData.total === 0 ? (
          <div className="space-y-3 border-dashed px-3 py-10 text-center">
            <p className="text-sm text-[color:var(--topo-muted)]">{hasFilters ? "No runs match these filters." : "No runs yet."}</p>
            {hasFilters ? <Button variant="secondary" onPress={clearFilters}>Clear filters</Button> : can("runs.create") ? (
            <Link
              href="/runs/new"
              className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-[color:var(--topo-accent)] px-3 text-sm font-medium text-[color:var(--accent-foreground)] transition active:scale-[0.98]"
            >
              <PlayIcon size={14} weight="bold" aria-hidden />
              Start a run
            </Link>) : null}
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
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
                aria-current={cursorIndex === i ? "true" : undefined}
                className={
                  cursorIndex === i ? "topo-selected-surface" : undefined
                }
              >
                <Link
                  href={`/runs/${run.id}`}
                  className="flex flex-col gap-2 px-3 py-2.5 transition-colors hover:bg-[color:var(--topo-chip)]/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-[color:var(--topo-ink)]">
                      {run.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[color:var(--topo-muted)]">
                      <span>{run.environment}</span>
                      <span>{run.assigneeName ?? "Unassigned"}</span>
                      <span>updated {formatWhen(run.updatedAt)}</span>
                    </div>
                    <RunProgressBar
                      className="mt-2 max-w-xs"
                      passed={run.passed}
                      failed={run.failed}
                      skipped={run.skipped}
                      blocked={run.blocked}
                      untested={run.untested}
                      total={run.total}
                    />
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {(run.passed ?? 0) > 0 || (run.failed ?? 0) > 0 ? (
                      <span className="font-mono text-xs text-[color:var(--topo-muted)]">
                        {run.passed ?? 0} passed · {run.failed ?? 0} failed
                      </span>
                    ) : null}
                    <StatusChip tone={statusToneForRun(run.status)} mono>
                      {formatStatusLabel(run.status)}
                    </StatusChip>
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}

        {!remote.loading && showRunListPagination ? (
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
      <RunTemplatesPanel />
    </div>
  );
}
