"use client";
import { useProjectActions } from "./project-actions";

import { useState } from "react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { BookmarkSimpleIcon, FloppyDiskIcon, TrashIcon } from "@phosphor-icons/react";
import { TopoSelect } from "./ui/topo-select";

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
              <Button
                type="button"
                size="sm"
                variant={active ? "primary" : "secondary"}
                onPress={() => onApply(view)}
                className="h-auto rounded-md px-2 py-1 text-xs"
              >
                {view.name}{view.visibility === "team" ? " · Team" : ""}
              </Button>
              {writable && (view.createdById === userId || (view.visibility === "team" && canAdmin)) ? (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="p-1 text-xs underline"
                  aria-label={`Edit view ${view.name}`}
                  onPress={() => {
                    onApply(view);
                    setEditing(view);
                    setName(view.name);
                    setVisibility(view.visibility ?? "private");
                    setShowSave(true);
                  }}
                >
                  Edit
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                isIconOnly
                isDisabled={saving || !writable || (Boolean(view.createdById) && view.createdById !== userId && !canAdmin)}
                aria-label={`Delete view ${view.name}`}
                className="rounded p-1 text-[color:var(--topo-muted)]"
                onPress={() => void removeView(view.id)}
              >
                <TrashIcon size={12} />
              </Button>
            </div>
          );
        })
      )}
      {showSave ? (
        <div className="flex flex-wrap items-center gap-2">
          <TopoSelect
            label="Visibility"
            ariaLabel="View visibility"
            className="w-40"
            value={visibility}
            onChange={(value) => setVisibility(value as "private" | "team")}
            options={[
              { id: "private", label: "Only me" },
              { id: "team", label: "Project team" },
            ]}
            compact
          />
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
