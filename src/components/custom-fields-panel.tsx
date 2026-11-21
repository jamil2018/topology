"use client";

import { useEffect, useState } from "react";
import { Button, Input } from "@heroui/react";
import { useMutationFeedback } from "./use-mutation-feedback";
import { useProjectActions } from "./project-actions";

type FieldRow = {
  id: string;
  entity: "case" | "result";
  key: string;
  label: string;
  type: string;
  required: boolean;
  options?: string[];
};

const emptyDraft = {
  entity: "case" as "case" | "result",
  key: "",
  label: "",
  type: "text",
  options: "",
  required: false,
};

export function CustomFieldsPanel() {
  const { can } = useProjectActions();
  const canManage = can("project.manage");
  const [fields, setFields] = useState<FieldRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { saving, submit } = useMutationFeedback(setError);
  const [draft, setDraft] = useState(emptyDraft);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/custom-fields");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Failed to load fields",
      );
      return;
    }
    setFields(data.fields ?? []);
    setError(null);
  }

  useEffect(() => {
    void reload();
  }, []);

  function startEdit(field: FieldRow) {
    setEditingId(field.id);
    setDeletingId(null);
    setDraft({
      entity: field.entity,
      key: field.key,
      label: field.label,
      type: field.type,
      options: (field.options ?? []).join(", "),
      required: field.required,
    });
  }

  function resetDraft() {
    setEditingId(null);
    setDeletingId(null);
    setDraft(emptyDraft);
  }

  async function save() {
    if (!canManage) return;
    if (!draft.label.trim() || (!editingId && !draft.key.trim())) return;
    return submit(async () => {
      const options = draft.options
        .split(/[;,]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (editingId) {
        const res = await fetch(`/api/custom-fields/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: draft.label.trim(),
            type: draft.type,
            required: draft.required,
            options: draft.type === "select" ? options : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Could not update",
          );
        }
      } else {
        const res = await fetch("/api/custom-fields", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entity: draft.entity,
            key: draft.key,
            label: draft.label,
            type: draft.type,
            required: draft.required,
            options,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Could not create field",
          );
        }
      }
      resetDraft();
      await reload();
    });
  }

  async function remove(id: string) {
    if (!canManage) return;
    return submit(async () => {
      const res = await fetch(`/api/custom-fields/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          typeof data.error === "string" ? data.error : "Could not delete",
        );
      }
      if (editingId === id) resetDraft();
      setDeletingId(null);
      await reload();
    });
  }

  return (
    <div className="space-y-3" id="fields">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Custom fields
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Extra fields on cases and results — the usual TestRail migration
          blocker. Admins can define them; values are edited on the case and
          during a run.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {canManage ? (
        <>
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              placeholder="key (severity)"
              value={draft.key}
              disabled={Boolean(editingId)}
              onChange={(e) =>
                setDraft((d) => ({ ...d, key: e.target.value }))
              }
            />
            <Input
              placeholder="Label"
              value={draft.label}
              onChange={(e) =>
                setDraft((d) => ({ ...d, label: e.target.value }))
              }
            />
            <select
              className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
              value={draft.entity}
              disabled={Boolean(editingId)}
              onChange={(e) =>
                setDraft((d) => ({
                  ...d,
                  entity: e.target.value as "case" | "result",
                }))
              }
            >
              <option value="case">On cases</option>
              <option value="result">On results</option>
            </select>
            <select
              className="rounded-md border border-[color:var(--topo-line)] bg-transparent px-2 py-1.5 text-sm"
              value={draft.type}
              onChange={(e) =>
                setDraft((d) => ({ ...d, type: e.target.value }))
              }
            >
              <option value="text">Text</option>
              <option value="number">Number</option>
              <option value="boolean">Boolean</option>
              <option value="select">Select</option>
              <option value="date">Date</option>
            </select>
            {draft.type === "select" ? (
              <Input
                className="sm:col-span-2"
                placeholder="Options (comma-separated)"
                value={draft.options}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, options: e.target.value }))
                }
              />
            ) : null}
          </div>
          <label className="flex items-center gap-2 text-xs text-[color:var(--topo-muted)]">
            <input
              type="checkbox"
              checked={draft.required}
              onChange={(e) =>
                setDraft((d) => ({ ...d, required: e.target.checked }))
              }
            />
            Required
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="primary"
              isDisabled={
                saving ||
                !draft.label.trim() ||
                (!editingId && !draft.key.trim())
              }
              onPress={() => void save()}
            >
              {editingId ? "Save field" : "Add field"}
            </Button>
            {editingId ? (
              <Button
                size="sm"
                variant="tertiary"
                isDisabled={saving}
                onPress={resetDraft}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        </>
      ) : (
        <p className="text-xs text-[color:var(--topo-muted)]">
          Project manage access is required to add or edit custom fields.
        </p>
      )}

      <ul className="divide-y divide-[color:var(--topo-line)] rounded-md border border-[color:var(--topo-line)]">
        {fields.length === 0 ? (
          <li className="px-3 py-2 text-xs text-[color:var(--topo-muted)]">
            No custom fields yet.
          </li>
        ) : (
          fields.map((field) => (
            <li
              key={field.id}
              className="flex items-center justify-between gap-2 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                  {field.key}
                </span>{" "}
                {field.label}
                <span className="ml-2 text-xs text-[color:var(--topo-muted)]">
                  {field.entity} · {field.type}
                  {field.required ? " · required" : ""}
                </span>
              </span>
              {canManage ? (
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={saving}
                    onPress={() => startEdit(field)}
                  >
                    Edit
                  </Button>
                  {deletingId === field.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        isDisabled={saving}
                        onPress={() => void remove(field.id)}
                      >
                        Confirm
                      </Button>
                      <Button
                        size="sm"
                        variant="tertiary"
                        isDisabled={saving}
                        onPress={() => setDeletingId(null)}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="tertiary"
                      isDisabled={saving}
                      onPress={() => setDeletingId(field.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
