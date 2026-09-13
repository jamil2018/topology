"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { Selection } from "@heroui/react";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { PageHeader } from "./page-header";
import { RunCasePickerTable } from "./run-case-picker-table";
import { StatusChip } from "./status-chip";
import {
  collectCaseTags,
  defaultReadySelection,
  visiblePickerCases,
  type CasePickerSort,
  type PickerCase,
} from "@/lib/run-case-picker";

type Folder = { id: string; name: string };

export function StartRunWorkspace({
  cases,
  folders,
}: {
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
  const selectedCount = selectedIds.size;
  const readyCount = cases.filter((c) => c.status === "ready").length;

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

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manual"
        title="Start a run"
        description="Plan a pass, attach ready cases, and record results as you execute."
        meta={
          <>
            <StatusChip mono>{readyCount} ready</StatusChip>
            <StatusChip mono>{selectedCount} selected</StatusChip>
          </>
        }
        actions={
          <Link
            href="/runs"
            className="inline-flex items-center gap-1.5 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
          >
            <CaretLeftIcon size={14} weight="bold" aria-hidden />
            Test Runs
          </Link>
        }
      />

      <nav
        aria-label="Breadcrumb"
        className="flex flex-wrap items-center gap-1.5 text-xs text-[color:var(--topo-muted)]"
      >
        <Link
          href="/runs"
          className="font-medium text-[color:var(--topo-ink)] underline-offset-2 hover:underline"
        >
          Test Runs
        </Link>
        <span aria-hidden>/</span>
        <span className="text-[color:var(--topo-ink)]">Start a run</span>
      </nav>

      <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
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
      </div>
    </div>
  );
}
