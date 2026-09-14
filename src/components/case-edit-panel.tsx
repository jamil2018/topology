"use client";

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
import { CaseHistoryPanel } from "./case-history-panel";
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
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [historyKey, setHistoryKey] = useState(0);
  const [showHistory, setShowHistory] = useState(false);

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
        JSON.stringify(detail.tags ?? [])
    );
  }, [detail, form]);

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
                      <ListBox.Item key={s} id={s} textValue={s}>
                        {s}
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
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                size="sm"
                isDisabled={readOnly || saving || !dirty || !form.title.trim()}
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
            </div>
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
