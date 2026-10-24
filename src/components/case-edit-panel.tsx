"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Input,
  TextArea,
  Label,
  TextField,
  ListBox,
  Select,
} from "@heroui/react";
import { FloppyDiskIcon, XIcon } from "@phosphor-icons/react";
import { folderPathLabel } from "@/lib/folder-tree";
import type { OrderedStep } from "@/lib/tcm/steps";
import { CaseHistoryPanel } from "./case-history-panel";
import {
  CaseStepsEditor,
  stepsFromFallback,
} from "./case-steps-editor";
import {
  CaseTcmPanel,
  type CustomFieldDefView,
  type DatasetDraft,
  type ParameterDraft,
} from "./case-tcm-panel";
import { formatStatusLabel } from "./cases-model";
import { useQualityGraph } from "./quality-graph-provider";
import { Bone } from "./skeletons";

const priorities = ["P0", "P1", "P2", "P3"] as const;
const statuses = ["draft", "ready", "blocked", "deprecated"] as const;

type Folder = { id: string; name: string; parentId: string | null };
type FlatFolder = Folder & { depth: number };

type CaseDetail = {
  id: string;
  key: string;
  title: string;
  description: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  priority: string;
  status: string;
  tags: string[];
  folderId: string | null;
  intentId?: string | null;
  intent?: {
    id: string;
    key: string;
    title: string;
    criticality: string;
    status: string;
  } | null;
  structuredSteps?: OrderedStep[];
  parameters?: ParameterDraft[];
  datasets?: DatasetDraft[];
  customFields?: Record<string, unknown>;
  customFieldDefs?: CustomFieldDefView[];
};

type EditForm = {
  title: string;
  description: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  priority: string;
  status: string;
  folderId: string;
  tags: string;
};

function toForm(detail: CaseDetail): EditForm {
  return {
    title: detail.title,
    description: detail.description ?? "",
    preconditions: detail.preconditions ?? "",
    steps: detail.steps ?? "",
    expectedResult: detail.expectedResult ?? "",
    priority: detail.priority,
    status: detail.status,
    folderId: detail.folderId ?? "",
    tags: (detail.tags ?? []).join("; "),
  };
}

function parseTags(raw: string) {
  return raw
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function CaseEditPanel({
  caseId,
  caseKey,
  caseTitle,
  folders,
  flatFolders,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  caseId: string;
  caseKey: string;
  caseTitle: string;
  folders: Folder[];
  flatFolders: FlatFolder[];
  onClose: () => void;
  onSaved: (next: {
    id: string;
    key: string;
    title: string;
    priority: string;
    status: string;
    tags: string[];
    folder: { id: string; name: string } | null;
  }) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { enabled: qualityGraphEnabled } = useQualityGraph();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);
  const [useStructured, setUseStructured] = useState(false);
  const [structuredSteps, setStructuredSteps] = useState<OrderedStep[]>([]);
  const [parameters, setParameters] = useState<ParameterDraft[]>([]);
  const [datasets, setDatasets] = useState<DatasetDraft[]>([]);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDefView[]>([]);
  const [sharedSteps, setSharedSteps] = useState<Array<{ id: string; name: string }>>([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setLoadError(null);
    setSaveError(null);
    setReadOnly(false);
    setShowHistory(false);
    void fetch(`/api/cases/${caseId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to load case",
          );
        }
        if (cancelled) return;
        const next = data.case as CaseDetail;
        setDetail(next);
        setForm(toForm(next));
        const stored = next.structuredSteps ?? [];
        setUseStructured(stored.length > 0);
        setStructuredSteps(stored);
        setParameters(next.parameters ?? []);
        setDatasets(next.datasets ?? []);
        setCustomFields(next.customFields ?? {});
        setCustomFieldDefs(next.customFieldDefs ?? []);
        if (stored.length > 0) {
          void fetch("/api/shared-steps")
            .then((res) => res.json())
            .then((shared) => {
              if (cancelled) return;
              setSharedSteps(
                (shared.sharedSteps ?? []).map(
                  (s: { id: string; name: string }) => ({
                    id: s.id,
                    name: s.name,
                  }),
                ),
              );
            })
            .catch(() => undefined);
        }
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load case");
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const dirty = useMemo(() => {
    if (!detail || !form) return false;
    return (
      form.title !== detail.title ||
      form.description !== (detail.description ?? "") ||
      form.preconditions !== (detail.preconditions ?? "") ||
      form.steps !== (detail.steps ?? "") ||
      form.expectedResult !== (detail.expectedResult ?? "") ||
      form.priority !== detail.priority ||
      form.status !== detail.status ||
      form.folderId !== (detail.folderId ?? "") ||
      JSON.stringify(parseTags(form.tags)) !==
        JSON.stringify(detail.tags ?? []) ||
      JSON.stringify(structuredSteps) !==
        JSON.stringify(detail.structuredSteps ?? []) ||
      JSON.stringify(parameters) !== JSON.stringify(detail.parameters ?? []) ||
      JSON.stringify(datasets) !== JSON.stringify(detail.datasets ?? []) ||
      JSON.stringify(customFields) !==
        JSON.stringify(detail.customFields ?? {})
    );
  }, [detail, form, structuredSteps, parameters, datasets, customFields]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  useEffect(() => {
    if (!dirty) return;
    function onBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  const saveDisabledReason = !form?.title.trim()
    ? "Title required"
    : !dirty
      ? "No changes"
      : null;

  async function save() {
    if (!form || !detail) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/cases/${caseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description,
          preconditions: form.preconditions,
          steps: form.steps,
          expectedResult: form.expectedResult,
          priority: form.priority,
          status: form.status,
          folderId: form.folderId || null,
          tags: parseTags(form.tags),
          ...(useStructured
            ? {
                structuredSteps,
                parameters,
                datasets,
                customFields,
              }
            : customFieldDefs.length > 0
              ? { customFields }
              : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setReadOnly(true);
        setSaveError(
          typeof data.error === "string"
            ? data.error
            : "You do not have permission to edit cases",
        );
        return;
      }
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string" ? data.error : "Failed to save case",
        );
        return;
      }
      const saved = data.case as CaseDetail & {
        folder?: { id: string; name: string } | null;
      };
      const nextDetail: CaseDetail = {
        id: saved.id,
        key: saved.key,
        title: saved.title,
        description: saved.description ?? "",
        preconditions: saved.preconditions ?? "",
        steps: saved.steps ?? "",
        expectedResult: saved.expectedResult ?? "",
        priority: saved.priority,
        status: saved.status,
        tags: saved.tags ?? [],
        folderId: saved.folderId ?? null,
        intentId: saved.intentId ?? detail.intentId,
        intent: saved.intent ?? detail.intent,
        structuredSteps: useStructured
          ? structuredSteps
          : (saved.structuredSteps ?? []),
        parameters,
        datasets,
        customFields,
        customFieldDefs,
      };
      setDetail(nextDetail);
      setForm(toForm(nextDetail));
      setHistoryKey((k) => k + 1);
      const folder =
        nextDetail.folderId != null
          ? (() => {
              const match = folders.find((f) => f.id === nextDetail.folderId);
              return match
                ? { id: match.id, name: match.name }
                : saved.folder
                  ? { id: saved.folder.id, name: saved.folder.name }
                  : null;
            })()
          : null;
      onSaved({
        id: nextDetail.id,
        key: nextDetail.key,
        title: nextDetail.title,
        priority: nextDetail.priority,
        status: nextDetail.status,
        tags: nextDetail.tags,
        folder,
      });
    } finally {
      setSaving(false);
    }
  }

  const headerKey = detail?.key ?? caseKey;
  const headerTitle = form?.title || detail?.title || caseTitle;

  return (
    <aside className="flex h-full max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
      <div className="flex items-start justify-between gap-2 border-b border-[color:var(--topo-line)] px-3 py-2.5">
        <div className="min-w-0">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
            Edit case
          </p>
          <p className="truncate font-mono text-xs text-[color:var(--topo-accent)]">
            {headerKey}
          </p>
          <p className="truncate text-sm font-medium text-[color:var(--topo-ink)]">
            {headerTitle}
          </p>
          {qualityGraphEnabled && detail?.intent ? (
            <p className="mt-1 text-[11px] text-[color:var(--topo-muted)]">
              Intent{" "}
              <Link
                href={`/intents?intent=${detail.intent.id}`}
                className="font-mono text-[color:var(--topo-accent)] hover:underline"
              >
                {detail.intent.key}
              </Link>
            </p>
          ) : qualityGraphEnabled && detail?.intentId ? (
            <p className="mt-1 text-[11px] text-[color:var(--topo-muted)]">
              Linked intent
            </p>
          ) : null}
        </div>
        <Button
          size="sm"
          variant="tertiary"
          aria-label="Close case editor"
          className="min-w-0 px-2"
          onPress={onClose}
        >
          <XIcon size={14} weight="bold" />
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {loading ? (
          <div className="space-y-3" aria-busy="true" aria-label="Loading case">
            <Bone className="h-8 w-full" />
            <Bone className="h-8 w-full" />
            <Bone className="h-20 w-full" />
            <Bone className="h-8 w-2/3" />
          </div>
        ) : loadError ? (
          <p className="text-sm text-red-600 dark:text-red-300">{loadError}</p>
        ) : form ? (
          <>
            {readOnly ? (
              <p className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-canvas)] px-2.5 py-2 text-xs text-[color:var(--topo-muted)]">
                Read-only — your role cannot edit cases.
              </p>
            ) : null}
            <TextField name="edit-title" className="w-full">
              <Label>Title</Label>
              <Input
                value={form.title}
                disabled={readOnly || saving}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, title: e.target.value } : f))
                }
                className="w-full"
              />
            </TextField>
            <TextField name="edit-description" className="w-full">
              <Label>Description</Label>
              <TextArea
                value={form.description}
                disabled={readOnly || saving}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, description: e.target.value } : f,
                  )
                }
                className="w-full min-h-16"
              />
            </TextField>
            <TextField name="edit-preconditions" className="w-full">
              <Label>Preconditions</Label>
              <TextArea
                value={form.preconditions}
                disabled={readOnly || saving}
                onChange={(e) =>
                  setForm((f) =>
                    f ? { ...f, preconditions: e.target.value } : f,
                  )
                }
                className="w-full min-h-14"
              />
            </TextField>
            {useStructured ? (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Structured steps</Label>
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={readOnly || saving}
                    onPress={() => setUseStructured(false)}
                  >
                    Use text steps
                  </Button>
                </div>
                <CaseStepsEditor
                  steps={structuredSteps}
                  onChange={setStructuredSteps}
                  disabled={readOnly || saving}
                  sharedSteps={sharedSteps}
                />
              </div>
            ) : (
              <>
                <TextField name="edit-steps" className="w-full">
                  <Label>Steps</Label>
                  <TextArea
                    value={form.steps}
                    disabled={readOnly || saving}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, steps: e.target.value } : f))
                    }
                    className="w-full min-h-20"
                  />
                </TextField>
                <TextField name="edit-expected" className="w-full">
                  <Label>Expected result</Label>
                  <TextArea
                    value={form.expectedResult}
                    disabled={readOnly || saving}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, expectedResult: e.target.value } : f,
                      )
                    }
                    className="w-full min-h-14"
                  />
                </TextField>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={readOnly || saving}
                  onPress={() => {
                    setStructuredSteps(
                      stepsFromFallback(form.steps, form.expectedResult),
                    );
                    setUseStructured(true);
                    void fetch("/api/shared-steps")
                      .then((res) => res.json())
                      .then((data) => {
                        setSharedSteps(
                          (data.sharedSteps ?? []).map(
                            (s: { id: string; name: string }) => ({
                              id: s.id,
                              name: s.name,
                            }),
                          ),
                        );
                      })
                      .catch(() => undefined);
                  }}
                >
                  Use structured steps
                </Button>
              </>
            )}
            <div className="grid gap-3">
              <Select
                className="w-full"
                variant="secondary"
                placeholder="Priority"
                value={form.priority}
                isDisabled={readOnly || saving}
                onChange={(value) => {
                  if (value == null) return;
                  setForm((f) =>
                    f ? { ...f, priority: String(value) } : f,
                  );
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
                        {p}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              <Select
                className="w-full"
                variant="secondary"
                placeholder="Status"
                value={form.status}
                isDisabled={readOnly || saving}
                onChange={(value) => {
                  if (value == null) return;
                  setForm((f) => (f ? { ...f, status: String(value) } : f));
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
                      <ListBox.Item
                        key={s}
                        id={s}
                        textValue={formatStatusLabel(s)}
                      >
                        {formatStatusLabel(s)}
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
                value={form.folderId || "none"}
                isDisabled={readOnly || saving}
                onChange={(value) => {
                  if (value == null) return;
                  const next = String(value);
                  setForm((f) =>
                    f
                      ? { ...f, folderId: next === "none" ? "" : next }
                      : f,
                  );
                }}
              >
                <Label>Folder</Label>
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="none" textValue="None">
                      None
                      <ListBox.ItemIndicator />
                    </ListBox.Item>
                    {flatFolders.map((f) => {
                      const label = folderPathLabel(folders, f.id);
                      return (
                        <ListBox.Item key={f.id} id={f.id} textValue={label}>
                          <span style={{ paddingLeft: f.depth * 10 }}>
                            {label}
                          </span>
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      );
                    })}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <TextField name="edit-tags" className="w-full">
              <Label>Tags</Label>
              <Input
                placeholder="smoke; ui"
                value={form.tags}
                disabled={readOnly || saving}
                onChange={(e) =>
                  setForm((f) => (f ? { ...f, tags: e.target.value } : f))
                }
                className="w-full"
              />
            </TextField>
            {saveError ? (
              <p className="text-sm text-red-600 dark:text-red-300">{saveError}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                isDisabled={readOnly || saving || Boolean(saveDisabledReason)}
                onPress={() => void save()}
              >
                <FloppyDiskIcon size={14} weight="bold" />
                {saving ? "Saving…" : "Save"}
              </Button>
              <Button
                variant="tertiary"
                size="sm"
                isDisabled={saving}
                onPress={onClose}
              >
                Close
              </Button>
              {saveDisabledReason && !readOnly ? (
                <p className="text-[11px] text-[color:var(--topo-muted)]">
                  {saveDisabledReason}
                </p>
              ) : dirty && !readOnly ? (
                <p className="text-[11px] text-[color:var(--topo-muted)]">
                  Unsaved changes
                </p>
              ) : null}
            </div>
            <CaseTcmPanel
              caseId={caseId}
              parameters={parameters}
              datasets={datasets}
              customFields={customFields}
              customFieldDefs={customFieldDefs}
              onParametersChange={setParameters}
              onDatasetsChange={setDatasets}
              onCustomFieldsChange={setCustomFields}
              disabled={readOnly || saving}
              onRestored={() => {
                setHistoryKey((k) => k + 1);
                void fetch(`/api/cases/${caseId}`)
                  .then((res) => res.json())
                  .then((data) => {
                    const next = data.case as CaseDetail;
                    setDetail(next);
                    setForm(toForm(next));
                    setStructuredSteps(next.structuredSteps ?? []);
                    setUseStructured((next.structuredSteps ?? []).length > 0);
                    setParameters(next.parameters ?? []);
                    setDatasets(next.datasets ?? []);
                    setCustomFields(next.customFields ?? {});
                  })
                  .catch(() => undefined);
              }}
            />
            <div className="border-t border-[color:var(--topo-line)] pt-3">
              <Button
                size="sm"
                variant="secondary"
                className="w-full justify-between"
                onPress={() => setShowHistory((v) => !v)}
              >
                {showHistory ? "Hide history" : "Show history"}
              </Button>
              {showHistory ? (
                <div className="mt-2 overflow-hidden rounded-md border border-[color:var(--topo-line)]">
                  <CaseHistoryPanel
                    key={`${caseId}-${historyKey}`}
                    caseId={caseId}
                    caseKey={headerKey}
                    caseTitle={headerTitle}
                    onClose={() => setShowHistory(false)}
                    embedded
                  />
                </div>
              ) : null}
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
