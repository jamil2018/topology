"use client";

import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { BookmarkSimpleIcon, TrashIcon } from "@phosphor-icons/react";

export type SavedViewRow = {
  id: string;
  name: string;
  entity: "cases" | "runs";
  config: unknown;
};

export function SavedViewsBar({
  entity,
  initialViews = [],
  activeViewId,
  onApply,
  onSaved,
  canSave,
  buildConfig,
}: {
  entity: "cases" | "runs";
  initialViews?: SavedViewRow[];
  activeViewId: string | null;
  onApply: (view: SavedViewRow) => void;
  onSaved?: (view: SavedViewRow) => void;
  canSave: boolean;
  buildConfig: () => unknown;
}) {
  const [views, setViews] = useState<SavedViewRow[]>(initialViews);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [viewsSource, setViewsSource] = useState(initialViews);
  if (viewsSource !== initialViews) {
    setViewsSource(initialViews);
    setViews(initialViews);
  }

  async function saveView() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/views", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          entity,
          config: buildConfig(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Failed to save view",
        );
        return;
      }
      setName("");
      setShowSave(false);
      if (data.view) {
        setViews((prev) => [data.view, ...prev]);
        onSaved?.(data.view);
      }
    } finally {
      setSaving(false);
    }
  }

  async function removeView(id: string) {
    const res = await fetch(`/api/views/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    setViews((prev) => prev.filter((v) => v.id !== id));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
        <BookmarkSimpleIcon size={12} weight="bold" />
        Views
      </span>
      {views.length === 0 ? (
        <span className="text-xs text-[color:var(--topo-muted)]">None saved</span>
      ) : (
        views.map((view) => {
          const active = view.id === activeViewId;
          return (
            <div key={view.id} className="inline-flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => onApply(view)}
                className={`rounded-md px-2 py-1 text-xs transition-colors ${
                  active
                    ? "bg-[color:var(--topo-ink)] text-[color:var(--topo-panel)]"
                    : "border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                }`}
              >
                {view.name}
              </button>
              <button
                type="button"
                aria-label={`Delete view ${view.name}`}
                className="rounded p-1 text-[color:var(--topo-muted)] hover:bg-[color:var(--topo-chip)] hover:text-[color:var(--topo-ink)]"
                onClick={() => void removeView(view.id)}
              >
                <TrashIcon size={12} />
              </button>
            </div>
          );
        })
      )}
      {showSave ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <TextField name="view-name" className="w-36">
            <Label className="sr-only">View name</Label>
            <Input
              placeholder="View name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full"
            />
          </TextField>
          <Button
            size="sm"
            variant="primary"
            isDisabled={saving || !canSave}
            onPress={() => void saveView()}
          >
            Save
          </Button>
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => {
              setShowSave(false);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          isDisabled={!canSave}
          onPress={() => setShowSave(true)}
        >
          Save current
        </Button>
      )}
      {error ? (
        <span className="text-xs text-red-600 dark:text-red-300">{error}</span>
      ) : null}
    </div>
  );
}
