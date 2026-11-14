"use client";
import { useProjectActions } from "./project-actions";

import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { BookmarkSimpleIcon, FloppyDiskIcon, TrashIcon } from "@phosphor-icons/react";

export type SavedViewRow = {
  id: string;
  name: string;
  entity: "cases" | "runs" | "intents";
  config: unknown;
  visibility?: "private" | "team";
  createdById?: string | null;
};

function errorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const error = (data as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) return error;
  return fallback;
}

export function SavedViewsBar({
  entity,
  initialViews = [],
  activeViewId,
  onApply,
  onSaved,
  canSave,
  buildConfig,
  className,
}: {
  entity: "cases" | "runs" | "intents";
  initialViews?: SavedViewRow[];
  activeViewId: string | null;
  onApply: (view: SavedViewRow) => void;
  onSaved?: (view: SavedViewRow) => void;
  canSave: boolean;
  buildConfig: () => unknown;
  className?: string;
}) {
  const { can, canAdmin, canWrite, userId } = useProjectActions();
  const writable = canWrite;
  const [visibility, setVisibility] = useState<"private" | "team">("private");
  const [views, setViews] = useState<SavedViewRow[]>(initialViews);
  const [editing, setEditing] = useState<SavedViewRow | null>(null);
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
    if (saving || !writable) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(editing ? `/api/views/${editing.id}` : "/api/views", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmed,
          visibility,
          entity,
          config: buildConfig(),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(errorMessage(data, "Failed to save view"));
        return;
      }
      setName("");
      setShowSave(false);
      if (data.view) {
        setViews((prev) => [data.view, ...prev.filter((view) => view.id !== data.view.id)]);
        setEditing(null);
        onSaved?.(data.view);
      }
    } catch {
      setError("Failed to save view");
    } finally {
      setSaving(false);
    }
  }

  async function removeView(id: string) {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/views/${id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not delete view. Try again.");
      setViews((previous) => previous.filter((view) => view.id !== id));
    } catch (error) { setError(error instanceof Error ? error.message : "Could not delete view"); }
    finally { setSaving(false); }
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-1.5${className ? ` ${className}` : ""}`}
    >
      <span className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-[color:var(--topo-muted)]">
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
                    ? "bg-[color:var(--topo-accent)] text-[color:var(--accent-foreground)]"
                    : "border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                }`}
              >
                {view.name}{view.visibility === "team" ? " · Team" : ""}
              </button>
              {writable && (view.createdById === userId || (view.visibility === "team" && canAdmin)) ? <button type="button" className="p-1 text-xs underline" aria-label={`Edit view ${view.name}`} onClick={() => { onApply(view); setEditing(view); setName(view.name); setVisibility(view.visibility ?? "private"); setShowSave(true); }}>Edit</button> : null}
              <button
                type="button"
                disabled={saving || !writable || (Boolean(view.createdById) && view.createdById !== userId && !canAdmin)}
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
          <label className="text-xs">Visibility
            <select aria-label="View visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as "private" | "team")} className="ml-2 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-2">
              <option value="private">Only me</option><option value="team">Project team</option>
            </select>
          </label>
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
            type="button"
            size="sm"
            variant="primary"
            isDisabled={saving || !canSave || !writable}
            onPress={() => void saveView()}
          >
            {saving ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="tertiary"
            onPress={() => {
              setShowSave(false);
              setEditing(null);
              setError(null);
            }}
          >
            Cancel
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="gap-1.5"
          isDisabled={!canSave || !writable}
          onPress={() => { setEditing(null); setName(""); setShowSave(true); }}
        >
          <FloppyDiskIcon size={14} weight="bold" />
          Save current
        </Button>
      )}
      {error ? (
        <span role="alert" className="text-xs text-red-600 dark:text-red-300">
          {error}
        </span>
      ) : null}
    </div>
  );
}
