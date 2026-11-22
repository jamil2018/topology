"use client";
import { useProjectActions } from "./project-actions";
import { useMutationFeedback } from "./use-mutation-feedback";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, TextArea } from "@heroui/react";
import type { IntentViewConfig } from "@/lib/saved-views";
import { paginateItems } from "@/lib/list-pagination";
import { EntityCollabPanel } from "./entity-collab-panel";
import { IntentReliabilityCards } from "./intent-reliability-cards";
import { IntentRepresentationPanel } from "./intent-representation";
import { LinkAutomationPanel } from "./link-automation-panel";
import { PageHeader } from "./page-header";
import { SavedViewsBar, type SavedViewRow } from "./saved-views-bar";
import { StatusChip } from "./status-chip";
import { TopoSelect } from "./ui/topo-select";

const INTENT_LIST_PAGE_SIZE = 20;

export type IntentListItem = {
  id: string;
  key: string;
  title: string;
  behavior: string;
  representationJson?: string | null;
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
  initialViews = [],
}: {
  initial: IntentListItem[];
  selectedId?: string | null;
  initialViews?: SavedViewRow[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [items, setItems] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const { can } = useProjectActions();
  const { saving, submit } = useMutationFeedback(setError);
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
  const [search, setSearch] = useState("");
  const [criticalityFilter, setCriticalityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sort, setSort] = useState<IntentViewConfig["sort"]>("key");
  const [activeViewId, setActiveViewId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = items.filter((intent) => {
      if (criticalityFilter !== "all" && intent.criticality !== criticalityFilter) {
        return false;
      }
      if (statusFilter !== "all" && intent.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return (
        intent.key.toLowerCase().includes(q) ||
        intent.title.toLowerCase().includes(q) ||
        intent.behavior.toLowerCase().includes(q)
      );
    });
    rows = [...rows].sort((a, b) => {
      const av = String(a[sort] ?? "");
      const bv = String(b[sort] ?? "");
      return av.localeCompare(bv);
    });
    return rows;
  }, [items, search, criticalityFilter, statusFilter, sort]);

  const pageData = useMemo(
    () => paginateItems(filtered, page, INTENT_LIST_PAGE_SIZE),
    [filtered, page],
  );

  const listFilterKey = `${search}|${criticalityFilter}|${statusFilter}|${sort}`;
  const [pageFilterKey, setPageFilterKey] = useState(listFilterKey);
  if (pageFilterKey !== listFilterKey) {
    setPageFilterKey(listFilterKey);
    if (page !== 1) setPage(1);
  } else if (page !== pageData.page) {
    setPage(pageData.page);
  }

  const rangeStart =
    pageData.total === 0 ? 0 : (pageData.page - 1) * INTENT_LIST_PAGE_SIZE + 1;
  const rangeEnd = Math.min(
    pageData.page * INTENT_LIST_PAGE_SIZE,
    pageData.total,
  );

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

  function applySavedView(view: SavedViewRow) {
    const config = view.config as IntentViewConfig;
    setSearch(config.search ?? "");
    setCriticalityFilter(config.criticalityFilter ?? "all");
    setStatusFilter(config.statusFilter ?? "all");
    setSort(config.sort ?? "key");
    setActiveViewId(view.id);
    setPage(1);
  }

  async function createIntent() {
    if (!can("intents.create")) return;
    return submit(async () => {
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
    });
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Quality graph"
        title="Test Intents"
        description="Behavior under test — manual cases and automation are implementations of the same intent."
        meta={
          <StatusChip mono>
            {filtered.length} intent{filtered.length === 1 ? "" : "s"}
          </StatusChip>
        }
      />

      {error ? (
        <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap items-end gap-3">
        <Input
          className="min-w-[12rem] flex-1"
          aria-label="Search intents"
          placeholder="Search key, title, behavior…"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setActiveViewId(null);
          }}
        />
        <TopoSelect
          ariaLabel="Criticality filter"
          className="w-40"
          value={criticalityFilter}
          onChange={(value) => {
            setCriticalityFilter(value);
            setActiveViewId(null);
          }}
          options={[
            { id: "all", label: "All criticality" },
            { id: "P0", label: "P0" },
            { id: "P1", label: "P1" },
            { id: "P2", label: "P2" },
            { id: "P3", label: "P3" },
          ]}
          compact
        />
        <TopoSelect
          ariaLabel="Status filter"
          className="w-36"
          value={statusFilter}
          onChange={(value) => {
            setStatusFilter(value);
            setActiveViewId(null);
          }}
          options={[
            { id: "all", label: "All status" },
            { id: "draft", label: "draft" },
            { id: "ready", label: "ready" },
            { id: "deprecated", label: "deprecated" },
          ]}
          compact
        />
        <TopoSelect
          ariaLabel="Sort intents"
          className="w-44"
          value={sort}
          onChange={(value) => {
            setSort(value as IntentViewConfig["sort"]);
            setActiveViewId(null);
          }}
          options={[
            { id: "key", label: "Sort by key" },
            { id: "title", label: "Sort by title" },
            { id: "criticality", label: "Sort by criticality" },
            { id: "status", label: "Sort by status" },
          ]}
          compact
        />
        <SavedViewsBar
          entity="intents"
          initialViews={initialViews}
          activeViewId={activeViewId}
          onApply={applySavedView}
          canSave
          buildConfig={() => ({
            search,
            criticalityFilter,
            statusFilter,
            sort,
          })}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
          <div className="border-b border-[color:var(--topo-line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
              Catalog
            </h2>
          </div>
          {pageData.total === 0 ? (
            <p className="px-4 py-8 text-sm text-[color:var(--topo-muted)]">
              No intents match these filters.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--topo-line)]">
              {pageData.items.map((intent) => {
                const types = [
                  ...new Set(intent.implementations.map((i) => i.type)),
                ];
                return (
                  <li key={intent.id}>
                    <Button
                      type="button"
                      variant="ghost"
                      onPress={() => setSelected(intent.id)}
                      className={`flex h-auto w-full items-start justify-between gap-3 rounded-none px-4 py-3 text-left text-sm transition-colors hover:bg-[color:var(--topo-chip)]/60 ${
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
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          {pageData.total > INTENT_LIST_PAGE_SIZE ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[color:var(--topo-line)] px-4 py-2">
              <p className="text-xs text-[color:var(--topo-muted)]">
                {rangeStart}–{rangeEnd} of {pageData.total}
              </p>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={pageData.page <= 1}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  isDisabled={pageData.page >= pageData.totalPages}
                  onPress={() =>
                    setPage((p) => Math.min(pageData.totalPages, p + 1))
                  }
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
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
              isDisabled={creating || pending || saving || !can("intents.create")}
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
                intentId={active.id}
                intentTitle={active.title}
                behavior={active.behavior}
                representationJson={active.representationJson ?? null}
                linkedCaseId={linkedCaseId}
              />

              <IntentReliabilityCards
                key={`rel-${active.id}`}
                intentId={active.id}
              />

              <div className="mt-4">
                <div className="text-xs font-medium text-[color:var(--topo-muted)]">
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
                            className="font-medium text-xs text-[color:var(--topo-accent)] hover:underline"
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
                <LinkAutomationPanel intentId={active.id} />
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
