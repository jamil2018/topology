"use client";

import { useEffect, useRef, useState } from "react";
import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
  TextField,
} from "@heroui/react";
import { SparkleIcon } from "@phosphor-icons/react";
import { motion } from "motion/react";
import { folderPathLabel } from "@/lib/folder-tree";
import type { OrderedStep } from "@/lib/tcm/steps";
import { CaseStepsEditor } from "./case-steps-editor";
import {
  CASE_PRIORITIES,
  CASE_STATUSES,
  emptyStructuredStep,
  formatStatusLabel,
  parseTagInput,
  type CaseRow,
  type FlatFolder,
  type Folder,
} from "./cases-model";

type CreateForm = {
  key: string;
  title: string;
  description: string;
  priority: string;
  status: string;
  folderId: string;
  tags: string;
};

function blankForm(key: string, folderId: string): CreateForm {
  return {
    key,
    title: "",
    description: "",
    priority: "P2",
    status: "draft",
    folderId,
    tags: "",
  };
}

export function CaseCreateDialog({
  folders,
  flatFolders,
  initialKey,
  initialFolderId,
  pending,
  onCreated,
  onCancel,
  onError,
}: {
  folders: Folder[];
  flatFolders: FlatFolder[];
  initialKey: string;
  initialFolderId: string;
  pending: boolean;
  onCreated: (row: CaseRow) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [form, setForm] = useState<CreateForm>(() =>
    blankForm(initialKey, initialFolderId),
  );
  const [steps, setSteps] = useState<OrderedStep[]>([emptyStructuredStep()]);
  const [saving, setSaving] = useState(false);
  const [draftingSteps, setDraftingSteps] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftSourceLabel, setDraftSourceLabel] = useState<string | null>(null);
  const [sharedSteps, setSharedSteps] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const lock = useRef(false);

  useEffect(() => {
    setForm(blankForm(initialKey, initialFolderId));
    setSteps([emptyStructuredStep()]);
    setDraftError(null);
    setDraftSourceLabel(null);
  }, [initialKey, initialFolderId]);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/shared-steps")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
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
    return () => {
      cancelled = true;
    };
  }, []);

  const busy = pending || saving || draftingSteps;

  async function draftStepsWithAi() {
    if (draftingSteps || pending || saving) return;
    if (!form.title.trim()) {
      setDraftError("Enter a title before drafting steps");
      return;
    }
    setDraftingSteps(true);
    setDraftError(null);
    setDraftSourceLabel(null);
    onError("");
    try {
      const res = await fetch("/api/ai/draft?heuristic=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: "case_steps",
          title: form.title.trim(),
          description: form.description,
          allowHeuristic: true,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDraftError(
          typeof data.error === "string"
            ? data.error
            : "Could not draft steps",
        );
        return;
      }
      const drafted = Array.isArray(data.steps)
        ? (data.steps as Array<{
            action?: string;
            expected?: string;
            data?: string;
          }>)
        : [];
      if (drafted.length === 0) {
        setDraftError("AI returned no steps to insert");
        return;
      }
      setSteps(
        drafted.map((step, index) => ({
          ...emptyStructuredStep(),
          position: index,
          action: step.action ?? "",
          expected: step.expected ?? "",
          data: step.data ?? "",
        })),
      );
      const heuristic =
        data.heuristic === true ||
        data.model === "heuristic" ||
        data.model == null;
      setDraftSourceLabel(
        heuristic
          ? "Local template — connect an AI provider in Settings for tailored drafts"
          : typeof data.model === "string" && data.model.trim()
            ? `Drafted with ${data.model}`
            : "Drafted with AI model",
      );
    } catch (error) {
      setDraftError(
        error instanceof Error ? error.message : "Could not draft steps",
      );
    } finally {
      setDraftingSteps(false);
    }
  }

  async function createCase() {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    onError("");
    try {
      const res = await fetch("/api/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: form.key.trim(),
          title: form.title.trim(),
          description: form.description,
          priority: form.priority,
          status: form.status,
          folderId: form.folderId || null,
          tags: parseTagInput(form.tags),
          structuredSteps: steps.filter((step) => step.action.trim() || step.expected.trim() || step.data.trim()).map((step) => ({ action: step.action, expected: step.expected, data: step.data, sharedStepId: step.sharedStepId })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        onError(
          typeof data.error === "string" ? data.error : "Failed to create case",
        );
        return;
      }
      const created = data.case as {
        id: string;
        key: string;
        title: string;
        priority: string;
        status: string;
        tags?: string[];
        folderId?: string | null;
        intentId?: string | null;
      };
      const folder =
        created.folderId != null
          ? (() => {
              const match = folders.find((item) => item.id === created.folderId);
              return match ? { id: match.id, name: match.name } : null;
            })()
          : null;
      onCreated({
        id: created.id,
        key: created.key,
        title: created.title,
        priority: created.priority,
        status: created.status,
        tags: created.tags ?? parseTagInput(form.tags),
        folder,
        intentId: created.intentId,
      });
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save case. Your draft is preserved.");
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-3 rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
    >
      <div>
        <TextField name="title" className="w-full">
          <Label>Title</Label>
          <p className="text-xs text-[color:var(--topo-muted)]">Required</p>
          <Input
            placeholder="What should this test verify?"
            autoFocus
            value={form.title}
            onChange={(e) =>
              setForm((current) => ({ ...current, title: e.target.value }))
            }
            className="w-full"
          />
        </TextField>
      </div>
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Label>Steps</Label>
          <Button
            size="sm"
            variant="secondary"
            isDisabled={busy || draftingSteps || !form.title.trim()}
            onPress={() => void draftStepsWithAi()}
          >
            <SparkleIcon size={14} weight="bold" />
            {draftingSteps ? "Drafting…" : "Draft steps with AI"}
          </Button>
        </div>
        <CaseStepsEditor
          steps={steps}
          onChange={setSteps}
          disabled={busy || draftingSteps}
          sharedSteps={sharedSteps}
        />
        {draftSourceLabel ? (
          <p className="text-xs text-[color:var(--topo-muted)]">
            {draftSourceLabel}
          </p>
        ) : null}
        {draftError ? (
          <p className="text-sm text-red-600 dark:text-red-300">{draftError}</p>
        ) : null}
      </div>
      <details className="rounded-md border border-[color:var(--topo-line)] p-3">
        <summary className="cursor-pointer text-sm font-medium text-[color:var(--topo-ink)]">Case details <span className="text-[color:var(--topo-muted)]">· {form.key || "Key required"} · {formatStatusLabel(form.status)} · {form.priority}</span></summary>
        <p className="my-2 text-sm text-[color:var(--topo-muted)]">A key is suggested for you. Adjust priority, status, folder, and tags here.</p>
        <TextField name="key" className="w-full">
          <Label>Key</Label>
          <Input
            placeholder="TOP-12"
            value={form.key}
            onChange={(e) => setForm((current) => ({ ...current, key: e.target.value }))}
            className="w-full"
          />
        </TextField>
      <TextField name="description" className="w-full">
        <Label>Description</Label>
        <TextArea
          value={form.description}
          onChange={(e) =>
            setForm((current) => ({ ...current, description: e.target.value }))
          }
          className="w-full"
        />
      </TextField>
      <div className="grid gap-3 sm:grid-cols-3">
        <Select
          className="w-full"
          variant="secondary"
          placeholder="Priority"
          value={form.priority}
          onChange={(value) => {
            if (value == null) return;
            setForm((current) => ({ ...current, priority: String(value) }));
          }}
        >
          <Label>Priority</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CASE_PRIORITIES.map((priority) => (
                <ListBox.Item key={priority} id={priority} textValue={priority}>
                  {priority}
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
          onChange={(value) => {
            if (value == null) return;
            setForm((current) => ({ ...current, status: String(value) }));
          }}
        >
          <Label>Status</Label>
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              {CASE_STATUSES.map((status) => (
                <ListBox.Item
                  key={status}
                  id={status}
                  textValue={formatStatusLabel(status)}
                >
                  {formatStatusLabel(status)}
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
          onChange={(value) => {
            if (value == null) return;
            const next = String(value);
            setForm((current) => ({
              ...current,
              folderId: next === "none" ? "" : next,
            }));
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
              {flatFolders.map((folder) => {
                const label = folderPathLabel(folders, folder.id);
                return (
                  <ListBox.Item key={folder.id} id={folder.id} textValue={label}>
                    <span style={{ paddingLeft: folder.depth * 10 }}>{label}</span>
                    <ListBox.ItemIndicator />
                  </ListBox.Item>
                );
              })}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      <TextField name="tags" className="w-full">
        <Label>Tags</Label>
        <Input
          placeholder="smoke; ui"
          value={form.tags}
          onChange={(e) => setForm((current) => ({ ...current, tags: e.target.value }))}
          className="w-full"
        />
      </TextField>
      </details>
      {!form.key.trim() ? <p role="alert">Enter a key in Case details to save.</p> : null}
      <p role="status" className="text-sm text-[color:var(--topo-muted)]">{!form.title.trim() ? "Enter a title to save this case." : form.status === "draft" ? "This case will be saved as Draft. When it is ready for testing, change Status to Ready in Case details." : `This case will be saved as ${formatStatusLabel(form.status)}.`}</p>
      <div className="flex gap-2">
        <Button
          variant="primary"
          isDisabled={busy || !form.key.trim() || !form.title.trim()}
          onPress={() => void createCase()}
        >
          Save case
        </Button>
        <Button variant="tertiary" onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </motion.div>
  );
}
