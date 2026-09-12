"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Checkbox,
  Chip,
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
  RUN_LIST_CONTROLS_THRESHOLD,
  RUN_LIST_PAGE_SIZE,
  type RunListSort,
} from "@/lib/run-list";

type RunRow = {
  id: string;
  name: string;
  status: string;
  environment: string;
  createdAt?: string | Date;
  updatedAt: string | Date;
};

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
}: {
  initialRuns: RunRow[];
  cases: PickerCase[];
  folders: Folder[];
}) {
  const router = useRouter();
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

  const showRunListControls = initialRuns.length > RUN_LIST_CONTROLS_THRESHOLD;
  const [runSearch, setRunSearch] = useState("");
  const [runSort, setRunSort] = useState<RunListSort>("updated");
  const [runPage, setRunPage] = useState(1);

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
    () =>
      showRunListControls
        ? filterAndSortRuns(initialRuns, runSearch, runSort)
        : initialRuns,
    [initialRuns, runSearch, runSort, showRunListControls],
  );

  const runPageData = useMemo(
    () =>
      showRunListControls
        ? paginateRuns(filteredRuns, runPage, RUN_LIST_PAGE_SIZE)
        : {
            page: 1,
            totalPages: 1,
            total: filteredRuns.length,
            items: filteredRuns,
          },
    [filteredRuns, runPage, showRunListControls],
  );

  const visibleIds = visible.map((c) => c.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;
  const readyCount = cases.filter((c) => c.status === "ready").length;
  /** Collapse create form when runs already exist; expand on empty for first-run UX. */
  const startRunDefaultExpanded = initialRuns.length === 0;

  function toggleCase(id: string, next: boolean) {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function selectAllVisible() {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      for (const id of visibleIds) copy.add(id);
      return copy;
    });
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  function resetToReady() {
    setStatus("ready");
    setPriority("all");
    setFolderId("all");
    setTag("all");
    setSearch("");
    setSelectedIds(new Set(defaultReadySelection(cases)));
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
        title="Runs"
        description="Plan a pass, attach ready cases, and record results as you execute."
        meta={<StatusChip mono>{initialRuns.length} runs</StatusChip>}
      />

      <Disclosure
        defaultExpanded={startRunDefaultExpanded}
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

            <div className="space-y-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-chip)]/30 p-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs font-medium text-[color:var(--topo-ink)]">
                  Cases for this run
                </div>
                <StatusChip mono>
                  {selectedCount} selected · {visible.length} visible
                </StatusChip>
              </div>

              <TextField name="case-search" className="w-full">
                <Label>Search</Label>
                <Input
                  placeholder="Title, key, ID, or tag"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full"
                />
              </TextField>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                <Select
                  className="w-full"
                  variant="secondary"
                  placeholder="Status"
                  value={status}
                  onChange={(value) => {
                    if (value == null) return;
                    setStatus(String(value));
                  }}
                >
                  <Label>Status</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {statuses.map((s) => (
                        <ListBox.Item key={s} id={s} textValue={s}>
                          {s === "all" ? "All statuses" : s}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                <Select
                  className="w-full"
                  variant="secondary"
                  placeholder="Priority"
                  value={priority}
                  onChange={(value) => {
                    if (value == null) return;
                    setPriority(String(value));
                  }}
                >
                  <Label>Priority</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      {priorities.map((p) => (
                        <ListBox.Item key={p} id={p} textValue={p}>
                          {p === "all" ? "All priorities" : p}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                <Select
                  className="w-full"
                  variant="secondary"
                  placeholder="Folder"
                  value={folderId}
                  onChange={(value) => {
                    if (value == null) return;
                    setFolderId(String(value));
                  }}
                >
                  <Label>Folder / suite</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="all" textValue="All folders">
                        All folders
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      {folders.map((f) => (
                        <ListBox.Item key={f.id} id={f.id} textValue={f.name}>
                          {f.name}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>

                <Select
                  className="w-full"
                  variant="secondary"
                  placeholder="Tag"
                  value={tag}
                  onChange={(value) => {
                    if (value == null) return;
                    setTag(String(value));
                  }}
                >
                  <Label>Tag</Label>
                  <Select.Trigger>
                    <Select.Value />
                    <Select.Indicator />
                  </Select.Trigger>
                  <Select.Popover>
                    <ListBox>
                      <ListBox.Item id="all" textValue="All tags">
                        All tags
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                      {tags.map((t) => (
                        <ListBox.Item key={t} id={t} textValue={t}>
                          {t}
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      ))}
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
                <div className="flex min-w-0 items-center gap-1.5">
                  <span
                    id="case-picker-sort-label"
                    className="shrink-0 text-xs text-[color:var(--topo-muted)]"
                  >
                    Sort
                  </span>
                  <Select
                    aria-labelledby="case-picker-sort-label"
                    className="w-[9.5rem] shrink-0"
                    variant="secondary"
                    placeholder="Updated"
                    value={sort}
                    onChange={(value) => {
                      if (value == null) return;
                      setSort(String(value) as CasePickerSort);
                    }}
                  >
                    <Select.Trigger className="h-9 min-h-9 py-0 md:h-8 md:min-h-8">
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        {sorts.map((s) => (
                          <ListBox.Item key={s.id} id={s.id} textValue={s.label}>
                            {s.label}
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                        ))}
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </div>

                <div
                  className="hidden h-4 w-px shrink-0 bg-[color:var(--topo-line)] sm:block"
                  aria-hidden
                />

                <div
                  className="flex flex-wrap items-center gap-1.5"
                  role="group"
                  aria-label="Case selection"
                >
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={visibleIds.length === 0 || allVisibleSelected}
                    onPress={selectAllVisible}
                  >
                    Select all visible
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    isDisabled={selectedCount === 0}
                    onPress={clearSelection}
                  >
                    Clear
                  </Button>
                  <Button size="sm" variant="tertiary" onPress={resetToReady}>
                    Reset to all ready
                  </Button>
                </div>
              </div>

              <div className="max-h-64 overflow-auto rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
                {visible.length === 0 ? (
                  <p className="px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
                    No cases match these filters.
                  </p>
                ) : (
                  <ul className="divide-y divide-[color:var(--topo-line)]">
                    {visible.map((c) => {
                      const checked = selectedIds.has(c.id);
                      return (
                        <li key={c.id}>
                          <Checkbox
                            isSelected={checked}
                            onChange={(next) => toggleCase(c.id, next)}
                            className="w-full px-2.5 py-2 hover:bg-[color:var(--topo-chip)]/40"
                          >
                            <Checkbox.Content className="flex w-full cursor-pointer items-start gap-2.5">
                              <Checkbox.Control className="mt-0.5">
                                <Checkbox.Indicator />
                              </Checkbox.Control>
                              <div className="min-w-0 flex-1 text-left">
                                <div className="truncate text-sm font-medium text-[color:var(--topo-ink)]">
                                  {c.title}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--topo-muted)]">
                                  <span className="font-mono">{c.key}</span>
                                  <StatusChip mono>{c.priority}</StatusChip>
                                  <StatusChip mono>{c.status}</StatusChip>
                                  {c.folder ? <span>{c.folder.name}</span> : null}
                                  {(c.tags ?? []).slice(0, 3).map((t) => (
                                    <Chip key={t} size="sm" variant="soft">
                                      {t}
                                    </Chip>
                                  ))}
                                </div>
                              </div>
                            </Checkbox.Content>
                          </Checkbox>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

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
        {showRunListControls ? (
          <div className="flex flex-col gap-2 border-b border-[color:var(--topo-line)] p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-2">
            <TextField name="run-list-search" className="min-w-0 flex-1">
              <Label className="sr-only">Search runs</Label>
              <Input
                aria-label="Search runs"
                placeholder="Search name, id, or status"
                value={runSearch}
                onChange={(e) => {
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
                  setRunSort(String(value) as RunListSort);
                  setRunPage(1);
                }}
              >
                <Select.Trigger className="h-9 min-h-9 py-0 md:h-8 md:min-h-8">
                  <Select.Value />
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

        {showRunListControls && runPageData.total > RUN_LIST_PAGE_SIZE ? (
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
