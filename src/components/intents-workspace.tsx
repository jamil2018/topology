"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, TextArea } from "@heroui/react";
import { EntityCollabPanel } from "./entity-collab-panel";
import { IntentRepresentationPanel } from "./intent-representation";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

export type IntentListItem = {
  id: string;
  key: string;
  title: string;
  behavior: string;
  criticality: string;
  status: string;
  freshness: "fresh" | "potentially_stale" | "stale" | "unverified";
  freshnessReason?: string | null;
  lastExecutedAt: Date | string | null;
  implementations: Array<{ id: string; type: string; caseId: string | null }>;
};

export function IntentsWorkspace({
  initial,
  selectedId,
}: {
  initial: IntentListItem[];
  selectedId?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(
    selectedId ?? initial[0]?.id ?? null,
  );
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({
    key: "",
    title: "",
    behavior: "",
    criticality: "P2",
  });

  const active = useMemo(
    () => items.find((i) => i.id === selected) ?? null,
    [items, selected],
  );

  const linkedCaseId = useMemo(() => {
    if (!active) return null;
    const manual = active.implementations.find(
      (i) => i.type === "manual" && i.caseId,
    );
    if (manual?.caseId) return manual.caseId;
    return active.implementations.find((i) => i.caseId)?.caseId ?? null;
  }, [active]);

  async function createIntent() {
    if (!draft.key.trim() || !draft.title.trim()) return;
    setError(null);
    setCreating(true);
    try {
      const res = await fetch("/api/intents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: draft.key.trim(),
          title: draft.title.trim(),
          behavior: draft.behavior,
          criticality: draft.criticality,
          status: "ready",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not create intent",
        );
        return;
      }
      setDraft({ key: "", title: "", behavior: "", criticality: "P2" });
      startTransition(() => router.refresh());
      const intent = data.intent as IntentListItem;
      setItems((prev) => [
        {
          ...intent,
          freshness: "unverified",
          freshnessReason: "Never executed",
          lastExecutedAt: null,
          implementations: [],
        },
        ...prev,
      ]);
      setSelected(intent.id);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quality graph"
        title="Test Intents"
        description="Behavior under test — manual cases and automation are implementations of the same intent."
        meta={
          <StatusChip mono>{items.length} intent{items.length === 1 ? "" : "s"}</StatusChip>
        }
      />

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
          <div className="border-b border-[color:var(--topo-line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
              Catalog
            </h2>
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-8 text-sm text-[color:var(--topo-muted)]">
              No intents yet. Create one or run migration/seed to backfill from cases.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--topo-line)]">
              {items.map((intent) => {
                const types = [
                  ...new Set(intent.implementations.map((i) => i.type)),
                ];
                return (
                  <li key={intent.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(intent.id)}
                      className={`flex w-full items-start justify-between gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-[color:var(--topo-chip)]/60 ${
                        selected === intent.id
                          ? "bg-[color:var(--topo-chip)]/80"
                          : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="truncate font-medium text-[color:var(--topo-ink)]">
                          <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                            {intent.key}
                          </span>{" "}
                          {intent.title}
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          <StatusChip mono>{intent.criticality}</StatusChip>
                          <StatusChip
                            mono
                            title={intent.freshnessReason ?? undefined}
                          >
                            {intent.freshness}
                          </StatusChip>
                          {types.map((t) => (
                            <StatusChip key={t} mono>
                              {t}
                            </StatusChip>
                          ))}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="space-y-4">
          <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
            <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
              New intent
            </h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <Input
                aria-label="Intent key"
                placeholder="AUTH-021"
                value={draft.key}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, key: e.target.value }))
                }
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
              placeholder="Account lockout after failed attempts"
              value={draft.title}
              onChange={(e) =>
                setDraft((d) => ({ ...d, title: e.target.value }))
              }
            />
            <TextArea
              className="mt-2"
              aria-label="Behavior"
              placeholder="Expected behavior under test"
              value={draft.behavior}
              onChange={(e) =>
                setDraft((d) => ({ ...d, behavior: e.target.value }))
              }
            />
            <Button
              className="mt-3"
              onPress={() => void createIntent()}
              isDisabled={creating || pending}
            >
              Create intent
            </Button>
          </div>

          {active ? (
            <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-mono text-xs text-[color:var(--topo-accent)]">
                    {active.key}
                  </div>
                  <h2 className="mt-1 text-lg font-semibold text-[color:var(--topo-ink)]">
                    {active.title}
                  </h2>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusChip mono>{active.criticality}</StatusChip>
                  <StatusChip mono>{active.status}</StatusChip>
                  <StatusChip
                    mono
                    title={active.freshnessReason ?? undefined}
                  >
                    {active.freshness}
                  </StatusChip>
                </div>
              </div>
              <p className="mt-3 text-sm text-[color:var(--topo-muted)]">
                {active.behavior || "No behavior description yet."}
              </p>

              <IntentRepresentationPanel
                key={active.id}
                intentTitle={active.title}
                behavior={active.behavior}
                linkedCaseId={linkedCaseId}
              />

              <div className="mt-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
                  Implementations
                </div>
                {active.implementations.length === 0 ? (
                  <p className="mt-2 text-sm text-[color:var(--topo-muted)]">
                    None yet. Creating a case with this key links a manual
                    implementation.
                  </p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {active.implementations.map((impl) => (
                      <li
                        key={impl.id}
                        className="flex items-center justify-between gap-2 rounded-sm border border-[color:var(--topo-line)] px-3 py-2 text-sm"
                      >
                        <StatusChip mono>{impl.type}</StatusChip>
                        {impl.caseId ? (
                          <Link
                            href={`/cases?case=${impl.caseId}`}
                            className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-accent)] hover:underline"
                          >
                            Open case
                          </Link>
                        ) : (
                          <span className="text-xs text-[color:var(--topo-muted)]">
                            No case link
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <EntityCollabPanel
                key={`collab-${active.id}`}
                entityType="intent"
                entityId={active.id}
              />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}
