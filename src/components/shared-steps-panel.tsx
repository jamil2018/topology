"use client";

import { useEffect, useState } from "react";
import { Button, Input, TextArea } from "@heroui/react";
import { useMutationFeedback } from "./use-mutation-feedback";
import { useProjectActions } from "./project-actions";

type StepItem = { action: string; expected: string; data: string };

type SharedStep = {
  id: string;
  name: string;
  description: string;
  items: StepItem[];
  usageCount?: number;
};

function emptyItem(): StepItem {
  return { action: "", expected: "", data: "" };
}

export function SharedStepsPanel() {
  const { can } = useProjectActions();
  const canEdit = can("cases.edit");
  const [rows, setRows] = useState<SharedStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const { saving, submit } = useMutationFeedback(setError);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [items, setItems] = useState<StepItem[]>([emptyItem()]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function reload() {
    const res = await fetch("/api/shared-steps");
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(typeof data.error === "string" ? data.error : "Failed to load");
      return;
    }
    setRows(data.sharedSteps ?? []);
    setError(null);
  }

  useEffect(() => {
    void reload();
  }, []);

  function resetDraft() {
    setName("");
    setDescription("");
    setItems([emptyItem()]);
    setEditingId(null);
    setDeletingId(null);
  }

  function startEdit(row: SharedStep) {
    setEditingId(row.id);
    setDeletingId(null);
    setName(row.name);
    setDescription(row.description ?? "");
    setItems(
      row.items.length > 0
        ? row.items.map((item) => ({
            action: item.action,
            expected: item.expected ?? "",
            data: item.data ?? "",
          }))
        : [emptyItem()],
    );
  }

  function updateItem(index: number, patch: Partial<StepItem>) {
    setItems((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );
  }

  function validItems() {
    return items
      .map((item) => ({
        action: item.action.trim(),
        expected: item.expected.trim(),
        data: item.data.trim(),
      }))
      .filter((item) => item.action.length > 0);
  }

  async function save() {
    if (!canEdit) return;
    const nextItems = validItems();
    if (!name.trim() || nextItems.length === 0) return;
    return submit(async () => {
      const body = {
        name: name.trim(),
        description: description.trim(),
        items: nextItems,
      };
      const res = await fetch(
        editingId ? `/api/shared-steps/${editingId}` : "/api/shared-steps",
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : editingId
              ? "Could not update"
              : "Could not create",
        );
      }
      resetDraft();
      await reload();
    });
  }

  async function remove(id: string) {
    if (!canEdit) return;
    return submit(async () => {
      const res = await fetch(`/api/shared-steps/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
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
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Shared steps
        </h2>
        <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
          Reusable multi-step blocks you can insert into any case.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-xs text-red-600 dark:text-red-300">
          {error}
        </p>
      ) : null}

      {canEdit ? (
        <div className="space-y-2 rounded-md border border-[color:var(--topo-line)] p-3">
          <p className="text-xs font-medium text-[color:var(--topo-muted)]">
            {editingId ? "Edit shared step" : "New shared step"}
          </p>
          <Input
            placeholder="Block name (Login)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <TextArea
            placeholder="Description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="min-h-12"
          />
          <ul className="space-y-2">
            {items.map((item, index) => (
              <li
                key={index}
                className="space-y-1.5 rounded-md border border-dashed border-[color:var(--topo-line)] p-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[color:var(--topo-muted)]">
                    Step {index + 1}
                  </span>
                  {items.length > 1 ? (
                    <Button
                      size="sm"
                      variant="tertiary"
                      onPress={() =>
                        setItems((prev) => prev.filter((_, i) => i !== index))
                      }
                    >
                      Remove
                    </Button>
                  ) : null}
                </div>
                <Input
                  placeholder="Action"
                  value={item.action}
                  onChange={(e) =>
                    updateItem(index, { action: e.target.value })
                  }
                />
                <TextArea
                  placeholder="Expected (optional)"
                  value={item.expected}
                  onChange={(e) =>
                    updateItem(index, { expected: e.target.value })
                  }
                  className="min-h-12"
                />
                <Input
                  placeholder="Data (optional)"
                  value={item.data}
                  onChange={(e) => updateItem(index, { data: e.target.value })}
                />
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="secondary"
              onPress={() => setItems((prev) => [...prev, emptyItem()])}
            >
              Add step
            </Button>
            <Button
              size="sm"
              variant="primary"
              isDisabled={
                saving || !name.trim() || validItems().length === 0
              }
              onPress={() => void save()}
            >
              {editingId ? "Save changes" : "Add shared step"}
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
        </div>
      ) : (
        <p className="text-xs text-[color:var(--topo-muted)]">
          You need edit access to manage shared steps.
        </p>
      )}

      <ul className="space-y-1 text-sm">
        {rows.map((row) => (
          <li
            key={row.id}
            className="rounded-md border border-[color:var(--topo-line)] px-3 py-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <span className="font-medium">{row.name}</span>
                <span className="ml-2 text-xs text-[color:var(--topo-muted)]">
                  {row.items.length} step{row.items.length === 1 ? "" : "s"}
                  {" · "}
                  used in {row.usageCount ?? 0} case step
                  {(row.usageCount ?? 0) === 1 ? "" : "s"}
                </span>
                {row.description ? (
                  <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
                    {row.description}
                  </p>
                ) : null}
              </div>
              {canEdit ? (
                <div className="flex flex-wrap gap-1">
                  <Button
                    size="sm"
                    variant="tertiary"
                    isDisabled={saving}
                    onPress={() => startEdit(row)}
                  >
                    Edit
                  </Button>
                  {deletingId === row.id ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        isDisabled={saving}
                        onPress={() => void remove(row.id)}
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
                      onPress={() => setDeletingId(row.id)}
                    >
                      Delete
                    </Button>
                  )}
                </div>
              ) : null}
            </div>
          </li>
        ))}
        {rows.length === 0 ? (
          <li className="text-xs text-[color:var(--topo-muted)]">
            No shared steps yet.
          </li>
        ) : null}
      </ul>
    </div>
  );
}
