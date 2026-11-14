"use client";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, TextArea } from "@heroui/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

type JourneyRow = {
  id: string;
  key: string;
  title: string;
  description: string;
  criticality: string;
  intentIds: string[];
};

export function JourneysWorkspace({
  initial,
}: {
  initial: JourneyRow[];
}) {
  const router = useRouter();
  const [transitionPending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
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

  async function createJourney() {
    if (!can("journeys.create")) return;
    return submit(async () => {
    if (!draft.key.trim() || !draft.title.trim()) return;
    setError(null);
    const res = await fetch("/api/journeys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Could not create journey",
      );
      return;
    }
    const row = data.journey as JourneyRow;
    setItems((prev) => [{ ...row, intentIds: row.intentIds ?? [] }, ...prev]);
    setDraft({ key: "", title: "", description: "", criticality: "P2" });
    startTransition(() => router.refresh());
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quality graph"
        title="Journeys"
        description="Critical user journeys linked to intents via part_of edges. Hub shows journey coverage."
        meta={<StatusChip mono>{items.length}</StatusChip>}
      />

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          New journey
        </h2>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="topo-field"><span>Journey key</span><Input
            aria-label="Journey key"
            placeholder="JOURNEY-CHECKOUT"
            value={draft.key}
            onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))}
          /></label>
          <label className="topo-field"><span>Criticality</span><Input
            aria-label="Criticality"
            value={draft.criticality}
            onChange={(e) =>
              setDraft((d) => ({ ...d, criticality: e.target.value }))
            }
          /></label>
        </div>
        <label className="topo-field"><span>Title</span><Input
          className="w-full"
          aria-label="Title"
          placeholder="Checkout to order confirmation"
          value={draft.title}
          onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
        /></label>
        <label className="topo-field"><span>Description</span><TextArea
          className="w-full"
          aria-label="Description"
          value={draft.description}
          onChange={(e) =>
            setDraft((d) => ({ ...d, description: e.target.value }))
          }
        /></label>
        <Button
          className="mt-3"
          onPress={() => void createJourney()}
          isDisabled={pending || !can("journeys.create")}
        >
          Create journey
        </Button>
      </div>

      <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
        {items.length === 0 ? (
          <p className="px-4 py-8 text-sm text-[color:var(--topo-muted)]">
            No journeys yet. Add a critical path to unlock journey coverage on the
            Hub.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {items.map((j) => (
              <li key={j.id} className="px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium text-[color:var(--topo-ink)]">
                      <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                        {j.key}
                      </span>{" "}
                      {j.title}
                    </div>
                    {j.description ? (
                      <p className="mt-1 text-sm text-[color:var(--topo-muted)]">
                        {j.description}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusChip mono>{j.criticality}</StatusChip>
                    <StatusChip mono>
                      {j.intentIds.length} intent
                      {j.intentIds.length === 1 ? "" : "s"}
                    </StatusChip>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
