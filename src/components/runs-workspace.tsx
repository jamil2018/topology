"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Checkbox,
  Chip,
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

type RunRow = {
  id: string;
  name: string;
  status: string;
  environment: string;
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

  const visibleIds = visible.map((c) => c.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;
  const readyCount = cases.filter((c) => c.status === "ready").length;

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

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manual"
        title="Runs"
        description="Plan a pass, attach ready cases, and record results as you execute."
        meta={<StatusChip mono>{initialRuns.length} runs</StatusChip>}
      />

      <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Start a run
        </h2>
        <p className="text-xs text-[color:var(--topo-muted)]">
          Defaults to all ready cases ({readyCount}). Search, filter, and
          multi-select to narrow before create — selection is required.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
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

          <div className="flex flex-wrap items-center gap-2">
            <Select
              className="min-w-[9rem]"
              variant="secondary"
              placeholder="Sort"
              value={sort}
              onChange={(value) => {
                if (value == null) return;
                setSort(String(value) as CasePickerSort);
              }}
            >
              <Label>Sort</Label>
              <Select.Trigger>
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
                      <label className="flex cursor-pointer items-start gap-2.5 px-2.5 py-2 hover:bg-[color:var(--topo-chip)]/40">
                        <Checkbox
                          isSelected={checked}
                          onChange={(next) => toggleCase(c.id, next)}
                          className="mt-0.5"
                        >
                          <Checkbox.Control>
                            <Checkbox.Indicator />
                          </Checkbox.Control>
                        </Checkbox>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-[color:var(--topo-ink)]">
                            {c.title}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-[color:var(--topo-muted)]">
                            <span className="font-mono">{c.key}</span>
                            <StatusChip mono>{c.priority}</StatusChip>
                            <StatusChip mono>{c.status}</StatusChip>
                            {c.folder ? (
                              <span>{c.folder.name}</span>
                            ) : null}
                            {(c.tags ?? []).slice(0, 3).map((t) => (
                              <Chip key={t} size="sm" variant="soft">
                                {t}
                              </Chip>
                            ))}
                          </div>
                        </div>
                      </label>
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
      </div>

      <div className="overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {initialRuns.length === 0 ? (
          <p className="border-dashed px-3 py-10 text-center text-sm text-[color:var(--topo-muted)]">
            No runs yet.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {initialRuns.map((run, i) => (
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
      </div>
    </div>
  );
}
