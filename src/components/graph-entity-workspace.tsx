"use client";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, TextArea } from "@heroui/react";
import { EntityCollabPanel } from "./entity-collab-panel";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

type EntityRow = {
  id: string;
  key: string;
  title: string;
  description: string;
  criticality: string;
};

export function GraphEntityWorkspace({
  kind,
  title,
  description,
  apiPath,
  initial,
}: {
  kind: "risks" | "components";
  title: string;
  description: string;
  apiPath: string;
  initial: EntityRow[];
}) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [selected, setSelected] = useState<string | null>(initial[0]?.id ?? null);
  const [error, setError] = useState<string | null>(null);
  const { can } = useProjectActions();
  const { saving, submit } = useMutationFeedback(setError);
  const pending = transitionPending || saving;
  const [draft, setDraft] = useState({
    key: "",
    title: "",
    description: "",
    criticality: "P2",
  });

  async function createEntity() {
    if (!can("requirements.create")) return;
    return submit(async () => {
    if (!draft.key.trim() || !draft.title.trim()) return;
    setError(null);
    const res = await fetch(apiPath, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string"
          ? data.error
          : `Could not create ${kind.slice(0, -1)}`,
      );
      return;
    }
    const row = (data.risk ?? data.component ?? data.entity) as EntityRow;
    setItems((prev) => [row, ...prev]);
    setDraft({ key: "", title: "", description: "", criticality: "P2" });
    startTransition(() => router.refresh());
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quality graph"
        title={title}
        description={description}
        meta={<StatusChip mono>{items.length}</StatusChip>}
      />

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          New {kind === "risks" ? "risk" : "component"}
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="topo-field"><span>Key</span><Input
            aria-label="Key"
            placeholder={kind === "risks" ? "RISK-PAY-1" : "auth-service"}
            value={draft.key}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
          /></label>
          <label className="topo-field"><span>Criticality</span><Input
            aria-label="Criticality"
            placeholder="P0–P3"
            value={draft.criticality}
            onChange={(e) =>
              setDraft((d) => ({ ...d, criticality: e.target.value }))
            }
          /></label>
        </div>
        <label className="topo-field"><span>Title</span><Input
          className="w-full"
          aria-label="Title"
          placeholder="Title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        /></label>
        <label className="topo-field"><span>Description</span><TextArea
          className="w-full"
          aria-label="Description"
          placeholder="Description"
          value={draft.description}
          onChange={(e) =>
            setDraft((d) => ({ ...d, description: e.target.value }))
          }
        /></label>
        <Button
          className="mt-3"
          onPress={() => void createEntity()}
          isDisabled={pending || !can("requirements.create")}
        >
          Create
        </Button>
      </div>

      <ul className="divide-y divide-[color:var(--topo-line)] rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {items.length === 0 ? (
          <li className="px-4 py-8 text-sm text-[color:var(--topo-muted)]">
            None yet.
          </li>
        ) : (
          items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`w-full px-4 py-3 text-left ${
                  selected === item.id ? "bg-[color:var(--topo-chip)]/80" : ""
                }`}
                onClick={() => setSelected(item.id)}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                    {item.key}
                  </span>
                  <span className="font-medium text-[color:var(--topo-ink)]">
                    {item.title}
                  </span>
                  <StatusChip mono>{item.criticality}</StatusChip>
                </div>
                {item.description ? (
                  <p className="mt-1 text-sm text-[color:var(--topo-muted)]">
                    {item.description}
                  </p>
                ) : null}
              </button>
              {selected === item.id && kind === "components" ? (
                <div className="border-t border-[color:var(--topo-line)] px-4 pb-4">
                  <EntityCollabPanel
                    entityType="component"
                    entityId={item.id}
                  />
                </div>
              ) : null}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
