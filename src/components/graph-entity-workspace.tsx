"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, TextArea } from "@heroui/react";
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
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    key: "",
    title: "",
    description: "",
    criticality: "P2",
  });

  async function createEntity() {
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
          <Input
            aria-label="Key"
            placeholder={kind === "risks" ? "RISK-PAY-1" : "auth-service"}
            value={draft.key}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
          />
          <Input
            aria-label="Criticality"
            placeholder="P0–P3"
            value={draft.criticality}
            onChange={(e) =>
              setDraft((d) => ({ ...d, criticality: e.target.value }))
            }
          />
        </div>
        <Input
          className="mt-2"
          aria-label="Title"
          placeholder="Title"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        />
        <TextArea
          className="mt-2"
          aria-label="Description"
          placeholder="Description"
          value={draft.description}
          onChange={(e) =>
            setDraft((d) => ({ ...d, description: e.target.value }))
          }
        />
        <Button
          className="mt-3"
          onPress={() => void createEntity()}
          isDisabled={pending}
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
            <li key={item.id} className="px-4 py-3">
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
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
