"use client";

import { useEffect, useState } from "react";
import {
  Button,
  Input,
  Label,
  ListBox,
  Select,
  TextArea,
  TextField,
} from "@heroui/react";
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

  useEffect(() => {
    setForm(blankForm(initialKey, initialFolderId));
    setSteps([emptyStructuredStep()]);
  }, [initialKey, initialFolderId]);

  async function createCase() {
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
      const filledSteps = steps.filter(
        (step) => step.action.trim() || step.expected.trim() || step.data.trim(),
      );
      if (filledSteps.length > 0) {
        await fetch(`/api/cases/${created.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ structuredSteps: filledSteps }),
        }).catch(() => undefined);
      }
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
    } finally {
      setSaving(false);
    }
  }

  const busy = pending || saving;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="space-y-3 rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField name="key" className="w-full">
          <Label>Key</Label>
          <Input
            placeholder="TOP-12"
            value={form.key}
            onChange={(e) => setForm((current) => ({ ...current, key: e.target.value }))}
            className="w-full"
          />
        </TextField>
        <TextField name="title" className="w-full">
          <Label>Title</Label>
          <Input
            placeholder="Case title"
            value={form.title}
            onChange={(e) =>
              setForm((current) => ({ ...current, title: e.target.value }))
            }
            className="w-full"
          />
        </TextField>
      </div>
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
      <div className="space-y-1.5">
        <Label>Steps</Label>
        <CaseStepsEditor steps={steps} onChange={setSteps} disabled={busy} />
      </div>
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
