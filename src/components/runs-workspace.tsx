"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Selection } from "@heroui/react";
import {
  Button,
  Disclosure,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
  TextField,
} from "@heroui/react";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { RunCasePickerTable } from "./run-case-picker-table";
import { SavedViewsBar, type SavedViewRow } from "./saved-views-bar";
import { StatusChip, statusToneForRun } from "./status-chip";
import {
  collectCaseTags,
  defaultReadySelection,
  visiblePickerCases,
  type CasePickerSort,
  type PickerCase,
} from "@/lib/run-case-picker";
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

type Folder = { id: string; name: string };

const runListSorts: { id: RunListSort; label: string }[] = [
  { id: "updated", label: "Updated" },
  { id: "created", label: "Created" },
  { id: "name", label: "Name" },
  { id: "status", label: "Status" },
];

export function RunsWorkspace({
  initialRuns,
  cases,
  folders,
  initialViews = [],
}: {
  initialRuns: RunRow[];
  cases: PickerCase[];
  folders: Folder[];
  initialViews?: SavedViewRow[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("ready");
  const [priority, setPriority] = useState<string>("all");
  const [folderId, setFolderId] = useState<string>("all");
  const [tag, setTag] = useState<string>("all");
  const [sort, setSort] = useState<CasePickerSort>("updated");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    () => new Set(defaultReadySelection(cases)),
  );

  const [runSearch, setRunSearch] = useState("");
  const [runSort, setRunSort] = useState<RunListSort>("updated");
  const [runPage, setRunPage] = useState(1);
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const forceNew = searchParams.get("new") === "1";
  const [startExpanded, setStartExpanded] = useState(
    () => forceNew || initialRuns.length === 0,
  );
  const [seenNewParam, setSeenNewParam] = useState(forceNew);
  if (forceNew && !seenNewParam) {
    setSeenNewParam(true);
    if (!startExpanded) setStartExpanded(true);
  }

  const tags = useMemo(() => collectCaseTags(cases), [cases]);
  const visible = useMemo(
    () =>
      visiblePickerCases(
        cases,
        { search, status, priority, folderId, tag },
        sort,
      ),
    [cases, search, status, priority, folderId, tag, sort],
  );

  const filteredRuns = useMemo(
    () => filterAndSortRuns(initialRuns, runSearch, runSort),
    [initialRuns, runSearch, runSort],
  );

  const runPageData = useMemo(
    () => paginateRuns(filteredRuns, runPage, RUN_LIST_PAGE_SIZE),
    [filteredRuns, runPage],
  );

  const visibleIds = visible.map((c) => c.id);
  const selectedCount = selectedIds.size;
  const readyCount = cases.filter((c) => c.status === "ready").length;
  const showRunListPagination = runPageData.total > RUN_LIST_PAGE_SIZE;

  function applyRunView(view: SavedViewRow) {
    const config = parseRunViewConfig(JSON.stringify(view.config));
    setRunSearch(config.search);
    setRunSort(config.sort);
    setRunPage(1);
    setActiveViewId(view.id);
  }

  function resetToReady() {
    setStatus("ready");
    setPriority("all");
    setFolderId("all");
    setTag("all");
    setSearch("");
    setSelectedIds(new Set(defaultReadySelection(cases)));
  }

  /** Preserve selections outside the current filter while Table manages visible rows. */
  function handlePickerSelectionChange(keys: Selection) {
    const visibleSet = new Set(visibleIds);
    setSelectedIds((prev) => {
      const next = new Set([...prev].filter((id) => !visibleSet.has(id)));
      if (keys === "all") {
        for (const id of visibleIds) next.add(id);
        return next;
      }
      for (const key of keys) next.add(String(key));
      return next;
    });
  }

  async function createRun() {
    setError(null);
    if (selectedIds.size === 0) {
      setError("Select at least one case, or reset to all ready.");
      return;
    }
    const res = await fetch("/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        caseIds: [...selectedIds],
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Failed to create run");
      return;
    }
    const data = await res.json();
    setName("");
    setDescription("");
    setSelectedIds(new Set(defaultReadySelection(cases)));
    startTransition(() => router.push(`/runs/${data.run.id}`));
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
      />

      <Disclosure
        isExpanded={startExpanded}
        onExpandedChange={setStartExpanded}
        className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3"
      >
        <Disclosure.Heading className="m-0">
          <Disclosure.Trigger className="flex w-full items-center gap-2 rounded-sm text-left text-[color:var(--topo-ink)] outline-none">
            <span className="min-w-0 flex-1 text-sm font-semibold">
              Start a run
            </span>
            <span className="hidden text-xs font-normal text-[color:var(--topo-muted)] sm:inline">
              {readyCount} ready · {selectedCount} selected
            </span>
            <Disclosure.Indicator className="text-[color:var(--topo-muted)]" />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className="space-y-3 pt-3">
            <p className="text-xs text-[color:var(--topo-muted)]">
              Defaults to all ready cases ({readyCount}). Search, filter, and
              multi-select to narrow before create — selection is required.
            </p>

            <div className="space-y-3">
              <TextField name="run-name" className="w-full">
                <Label>Run name</Label>
                <Input
                  placeholder="Release 1.0 smoke"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full"
                />
              </TextField>
              <TextField name="run-notes" className="w-full">
                <Label>Notes</Label>
                <TextArea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full"
                />
              </TextField>
            </div>

            <RunCasePickerTable
              visible={visible}
              folders={folders}
              tags={tags}
              search={search}
              status={status}
              priority={priority}
              folderId={folderId}
              tag={tag}
              sort={sort}
              selectedIds={selectedIds}
              onSearchChange={setSearch}
              onStatusChange={setStatus}
              onPriorityChange={setPriority}
              onFolderChange={setFolderId}
              onTagChange={setTag}
              onSortChange={setSort}
              onSelectionChange={handlePickerSelectionChange}
              onResetToReady={resetToReady}
            />

            {error ? (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            ) : null}
            <Button
              variant="primary"
              isDisabled={pending || !name.trim() || selectedCount === 0}
              onPress={() => void createRun()}
            >
              Create run · {selectedCount}
            </Button>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>

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
          <p className="border-dashed px-3 py-10 text-center text-sm text-[color:var(--topo-muted)]">
            No runs yet.
          </p>
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
