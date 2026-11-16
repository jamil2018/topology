"use client";
import type { RunTemplateView } from "@/lib/run-template";
import type { prepareRetest } from "@/lib/retest";
import { RetestCaseLink } from "./retest-case-link";
import { useProjectActions } from "./project-actions";

import Link from "next/link";
import { useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { Selection } from "@heroui/react";
import { Button, Input, Label, TextArea, TextField } from "@heroui/react";
import { CaretLeftIcon } from "@phosphor-icons/react";
import { PageHeader } from "./page-header";
import { GuidedFirstRun } from "./guided-first-run";
import { RunCasePickerTable } from "./run-case-picker-table";
import { StatusChip } from "./status-chip";
import {
  collectCaseTags,
  defaultReadySelection,
  visiblePickerCases,
  type CasePickerSort,
  type PickerCase,
} from "@/lib/run-case-picker";

const subscribeHydration = () => () => {};

type Folder = { id: string; name: string };

export function StartRunWorkspace({
  cases,
  folders,
  initialTemplate,
  editTemplate = false,
  retest = null,
  members = [],
}: {
  cases: PickerCase[];
  initialTemplate?: RunTemplateView;
  editTemplate?: boolean;
  retest?: Awaited<ReturnType<typeof prepareRetest>>;
  members?: { id: string; label: string }[];
  folders: Folder[];
}) {
  const { can, canAdmin, userId } = useProjectActions();
  const canSaveTemplate = editTemplate ? canAdmin || (can("runs.create") && initialTemplate?.createdById === userId) : can("runs.create");
  const hydrated = useSyncExternalStore(subscribeHydration, () => true, () => false);
  const creating = useRef(false);
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialTemplate?.name ?? (retest ? "Retest failures" : ""));
  const [description, setDescription] = useState(initialTemplate?.description ?? "");
  const [environment, setEnvironment] = useState(initialTemplate?.environment ?? "local");
  const [assigneeId, setAssigneeId] = useState(initialTemplate?.assigneeId ?? "");
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>(initialTemplate || retest ? "all" : "ready");
  const [priority, setPriority] = useState<string>("all");
  const [folderId, setFolderId] = useState<string>("all");
  const [tag, setTag] = useState<string>("all");
  const [sort, setSort] = useState<CasePickerSort>("updated");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => {
    if (initialTemplate) return new Set(initialTemplate.caseIds);
    if (retest) return new Set(retest.caseIds);
    const fromQuery = (searchParams.get("cases") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter((id) => cases.some((row) => row.id === id));
    if (fromQuery.length > 0) return new Set(fromQuery);
    return new Set(defaultReadySelection(cases));
  });

  const missingIds = [...selectedIds].filter((id) => !cases.some((row) => row.id === id));
  const unavailableAssignee = Boolean(assigneeId && !members.some((member) => member.id === assigneeId));
  const invalidSelection = missingIds.length > 0 || unavailableAssignee;
  const [optionsOpen, setOptionsOpen] = useState(unavailableAssignee || !environment.trim());
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

  const visibleIds = visible.filter((row) => !retest || retest.caseIds.includes(row.id)).map((c) => c.id);
  const selectedCount = selectedIds.size;
  const readyCount = cases.filter((c) => c.status === "ready").length;

  function resetToReady() {
    setStatus("ready");
    setPriority("all");
    setFolderId("all");
    setTag("all");
    setSearch("");
    setSelectedIds(new Set(defaultReadySelection(retest ? cases.filter((row) => retest.caseIds.includes(row.id)) : cases)));
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
    if (!can("runs.create") || creating.current || invalidSelection) return;
    setError(null);
    if (selectedIds.size === 0) {
      setError("Select at least one case, or reset to all ready.");
      return;
    }
    creating.current = true;
    setSaving(true);
    try {
    const res = await fetch(retest ? "/api/runs/retest" : "/api/runs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        description,
        caseIds: [...selectedIds],
        environment, assigneeId: assigneeId || null,
        ...(retest ? { sourceResultIds: retest.eligible.filter((source) => selectedIds.has(source.caseId!)).map((source) => source.id) } : {}),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data.error === "string" ? data.error : "Failed to create run");
      return;
    }
    const data = await res.json();
    startTransition(() => router.push(`/runs/${data.run.id}`));
    } catch {
      setError("Could not create the run. Your selection is still here; try again.");
    } finally { creating.current = false; setSaving(false); }

  }

  async function saveTemplate() {
    if (!canSaveTemplate || creating.current || invalidSelection || !selectedIds.size) return;
    creating.current = true; setSaving(true); setError(null); setSavedMessage(null);
    try {
      const response = await fetch(editTemplate && initialTemplate ? `/api/run-templates/${initialTemplate.id}` : "/api/run-templates", {
        method: editTemplate && initialTemplate ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description, caseIds: [...selectedIds], environment, assigneeId: assigneeId || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not save template");
      setSavedMessage("Template saved. Find it under Test runs.");
    } catch (error) { setError(error instanceof Error ? error.message : "Could not save template"); }
    finally { creating.current = false; setSaving(false); }
  }

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Manual"
        title={editTemplate ? "Edit run template" : retest ? "Review retest" : "Start a run"}
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
            Test runs
          </Link>
        }
      />

      {cases.length === 0 ? (
        <GuidedFirstRun
          title="Create a case first"
          description="A run needs at least one case. Author a case, then come back here to execute it."
        />
      ) : null}

      <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
        <p className="text-xs text-[color:var(--topo-muted)]">
          {initialTemplate ? "Review the saved template’s cases and options before creating a run." : retest ? "Review the failed cases selected for this retest." : "Give this run a name, then review the selected cases below."}
        </p>

        <div className="space-y-3">
          <TextField name="run-name" className="w-full">
            <Label>Run name</Label>
            <p className="text-xs text-[color:var(--topo-muted)]">Required</p>
            <Input
              disabled={!hydrated}
              placeholder="Release 1.0 smoke"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
            />
          </TextField>
        </div>
        <details open={optionsOpen} onToggle={(event) => setOptionsOpen(event.currentTarget.open)} className="rounded-md border border-[color:var(--topo-line)] p-3">
          <summary className="cursor-pointer text-sm font-medium text-[color:var(--topo-ink)]">Run options · {environment || "Environment required"} · {members.find((member) => member.id === assigneeId)?.label ?? (unavailableAssignee ? "Unavailable assignee" : "Unassigned")}</summary>
          <div className="mt-3 space-y-3">
          <TextField name="run-notes" className="w-full">
            <Label>Notes</Label>
            <TextArea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full"
            />
          </TextField>
        <div className="topo-toolbar">
          <label>Environment <input value={environment} onChange={(event) => setEnvironment(event.target.value)} /></label>
          {!retest ? <label>Assignee <select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{unavailableAssignee ? <option value={assigneeId}>Unavailable member — choose another</option> : null}{members.map((member) => <option value={member.id} key={member.id}>{member.label}</option>)}</select></label> : null}
        </div>
          </div>
        </details>
        {missingIds.length ? <p role="alert" className="topo-feedback">{missingIds.length} selected cases are unavailable. <button onClick={() => setSelectedIds(new Set([...selectedIds].filter((id) => !missingIds.includes(id))))}>Remove unavailable cases</button></p> : null}
        {retest?.excluded.length ? <section className="topo-feedback"><h2 className="font-medium">Excluded from retest</h2><ul>{retest.excluded.map((item) => <li key={item.id}>{item.caseTitle || item.title || "Automation result"}: {item.reason}. <Link className="underline" href={`/runs/${item.runId}?result=${item.id}`}>Open source result</Link>{!item.caseId ? <RetestCaseLink resultId={item.id} cases={cases} onLinked={(id) => setSelectedIds((previous) => new Set([...previous, id]))} /> : null}</li>)}</ul></section> : null}
        <RunCasePickerTable
          visible={retest ? visible.filter((row) => retest.caseIds.includes(row.id)) : visible}
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
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
        ) : null}
        {editTemplate && !canSaveTemplate ? <p className="text-sm">Only the template creator or a project administrator can save changes. You can review this selection and create a new run if your role permits it.</p> : null}
        {savedMessage ? <p role="status" className="text-sm">{savedMessage} <Link href="/runs" className="underline">View templates</Link></p> : null}
        <div className="sticky bottom-2 z-10 flex flex-wrap items-center gap-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
          <p className="mr-auto text-sm" role="status">{!can("runs.create") ? "Your role cannot create runs." : !name.trim() ? "Enter a run name to continue." : !environment.trim() ? "Enter an environment in Run options." : unavailableAssignee ? "Choose an available assignee in Run options." : missingIds.length ? "Remove unavailable cases to continue." : !selectedCount ? "Select at least one case to continue." : `${selectedCount} cases selected. Ready to create.`}</p>
        {!retest ? <Button variant="secondary" isDisabled={saving || invalidSelection || !name.trim() || !selectedCount || !canSaveTemplate} onPress={() => void saveTemplate()}>{editTemplate ? "Save template changes" : "Save as template"}</Button> : null}
        <Button
          variant="primary"
          isDisabled={!can("runs.create") || invalidSelection || saving || pending || !environment.trim() || !name.trim() || selectedCount === 0}
          onPress={() => void createRun()}
        >
          {saving || pending ? "Saving…" : `Create run · ${selectedCount}`}
        </Button>
        </div>
      </div>
    </div>
  );
}
