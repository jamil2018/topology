"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, TextArea } from "@heroui/react";
import {
  emptyRepresentation,
  fromTraditionalSteps,
  isEmptyRepresentation,
  normalizeRepresentation,
  parseRepresentation,
  toGherkin,
  toNaturalLanguage,
  toStepTable,
  toTraditionalSteps,
  type StructuredRepresentation,
} from "@topology/domain";

export const REPRESENTATION_VIEWS = [
  "traditional",
  "bdd",
  "natural",
  "structured",
] as const;

export type RepresentationView = (typeof REPRESENTATION_VIEWS)[number];

const VIEW_LABELS: Record<RepresentationView, string> = {
  traditional: "Traditional",
  bdd: "BDD",
  natural: "Natural",
  structured: "Structured",
};

/**
 * Derive a structured intent representation from representationJson,
 * linked case steps, or freeform behavior text.
 */
export function deriveIntentRepresentation(input: {
  representationJson?: string | null;
  steps?: string | null;
  expectedResult?: string | null;
  behavior?: string | null;
}): StructuredRepresentation {
  if (input.representationJson?.trim()) {
    try {
      const parsed = JSON.parse(input.representationJson) as Partial<StructuredRepresentation>;
      const fromJson = normalizeRepresentation(parsed);
      if (!isEmptyRepresentation(fromJson)) return fromJson;
    } catch {
      /* fall through */
    }
  }
  const steps = input.steps ?? "";
  const expectedResult = input.expectedResult ?? "";
  if (steps.trim() || expectedResult.trim()) {
    const fromCase = fromTraditionalSteps(steps, expectedResult);
    if (!isEmptyRepresentation(fromCase)) return fromCase;
  }
  if (input.behavior?.trim()) {
    return parseRepresentation(input.behavior);
  }
  return emptyRepresentation();
}

type LinkedCaseDetail = {
  id: string;
  steps: string;
  expectedResult: string;
};

export function IntentRepresentationPanel({
  intentId,
  intentTitle,
  behavior,
  representationJson = null,
  linkedCaseId,
}: {
  intentId: string;
  intentTitle: string;
  behavior: string;
  representationJson?: string | null;
  linkedCaseId: string | null;
}) {
  const [view, setView] = useState<RepresentationView>("traditional");
  const [loading, setLoading] = useState(Boolean(linkedCaseId));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [linkedCase, setLinkedCase] = useState<LinkedCaseDetail | null>(null);
  const [stepsDraft, setStepsDraft] = useState("");
  const [expectedDraft, setExpectedDraft] = useState("");
  const [bddDraft, setBddDraft] = useState("");
  const [storedJson, setStoredJson] = useState(representationJson);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  useEffect(() => {
    setStoredJson(representationJson);
  }, [representationJson]);

  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    setSaveError(null);
    setSaveOk(false);

    if (!linkedCaseId) {
      setLinkedCase(null);
      setLoading(false);
      const projected = toTraditionalSteps(
        deriveIntentRepresentation({
          representationJson: representationJson,
          behavior,
        }),
      );
      setStepsDraft(projected.steps);
      setExpectedDraft(projected.expectedResult);
      return;
    }

    setLoading(true);
    void fetch(`/api/cases/${linkedCaseId}`)
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(
            typeof data.error === "string" ? data.error : "Failed to load case",
          );
        }
        if (cancelled) return;
        const c = data.case as {
          id: string;
          steps?: string;
          expectedResult?: string;
        };
        const detail: LinkedCaseDetail = {
          id: c.id,
          steps: c.steps ?? "",
          expectedResult: c.expectedResult ?? "",
        };
        setLinkedCase(detail);
        setStepsDraft(detail.steps);
        setExpectedDraft(detail.expectedResult);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Failed to load case");
        setLinkedCase(null);
        const projected = toTraditionalSteps(
          deriveIntentRepresentation({
            representationJson,
            behavior,
          }),
        );
        setStepsDraft(projected.steps);
        setExpectedDraft(projected.expectedResult);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [linkedCaseId, behavior, representationJson]);

  const liveStructured = useMemo(
    () =>
      deriveIntentRepresentation({
        representationJson: storedJson,
        steps: stepsDraft,
        expectedResult: expectedDraft,
        behavior,
      }),
    [storedJson, stepsDraft, expectedDraft, behavior],
  );

  // Keep BDD editor in sync when switching to that view.
  useEffect(() => {
    if (view === "bdd") {
      setBddDraft(toGherkin(liveStructured, { scenario: intentTitle }));
    }
  }, [view, intentTitle]); // eslint-disable-line react-hooks/exhaustive-deps -- only sync on view change

  const dirtyTraditional =
    Boolean(linkedCase) &&
    (stepsDraft !== (linkedCase?.steps ?? "") ||
      expectedDraft !== (linkedCase?.expectedResult ?? ""));

  const canEditTraditional = Boolean(linkedCaseId && linkedCase);

  async function saveTraditional() {
    if (!linkedCaseId || !linkedCase) return;
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch(`/api/cases/${linkedCaseId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steps: stepsDraft,
          expectedResult: expectedDraft,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string" ? data.error : "Could not save steps",
        );
        return;
      }
      const structured = fromTraditionalSteps(stepsDraft, expectedDraft);
      await fetch("/api/intents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: intentId,
          representationJson: JSON.stringify(structured),
        }),
      });
      const next = data.case as {
        steps?: string;
        expectedResult?: string;
      };
      const nextSteps = next.steps ?? stepsDraft;
      const nextExpected = next.expectedResult ?? expectedDraft;
      setLinkedCase({
        id: linkedCaseId,
        steps: nextSteps,
        expectedResult: nextExpected,
      });
      setStepsDraft(nextSteps);
      setExpectedDraft(nextExpected);
      setStoredJson(JSON.stringify(structured));
      setSaveOk(true);
    } finally {
      setSaving(false);
    }
  }

  async function saveCanonical(structured: StructuredRepresentation) {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const res = await fetch("/api/intents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: intentId,
          representationJson: JSON.stringify(structured),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSaveError(
          typeof data.error === "string"
            ? data.error
            : "Could not save representation",
        );
        return;
      }
      setStoredJson(JSON.stringify(structured));
      setSaveOk(true);
    } finally {
      setSaving(false);
    }
  }

  const empty = isEmptyRepresentation(liveStructured);

  return (
    <div className="mt-4 border-t border-[color:var(--topo-line)] pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
          Representation
        </div>
        <div
          className="flex flex-wrap gap-1"
          role="group"
          aria-label="Representation view"
        >
          {REPRESENTATION_VIEWS.map((id) => {
            const active = view === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={active}
                onClick={() => setView(id)}
                className={`rounded-md px-2 py-1 text-xs transition active:scale-[0.98] ${
                  active
                    ? "bg-[color:var(--topo-accent)] text-[color:var(--accent-foreground)]"
                    : "bg-[color:var(--topo-chip)] text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                }`}
              >
                {VIEW_LABELS[id]}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <p className="mt-3 text-sm text-[color:var(--topo-muted)]">
          Loading linked case…
        </p>
      ) : null}

      {loadError ? (
        <p className="mt-3 rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-800 dark:text-amber-200">
          {loadError}. Showing projections from intent representation.
        </p>
      ) : null}

      {!loading && empty && view !== "traditional" && view !== "bdd" ? (
        <p className="mt-3 text-sm text-[color:var(--topo-muted)]">
          No structured steps yet. Add traditional steps, edit BDD, or describe
          Given/When/Then in behavior.
        </p>
      ) : null}

      {!loading && view === "traditional" ? (
        <div className="mt-3 space-y-3">
          {!canEditTraditional ? (
            <p className="text-xs text-[color:var(--topo-muted)]">
              {linkedCaseId
                ? "Could not load the linked case for editing."
                : "Read-only projection. Link a manual case to edit traditional steps, or use BDD to edit the canonical representation."}
            </p>
          ) : (
            <p className="text-xs text-[color:var(--topo-muted)]">
              Edits write to the linked manual case and update representationJson
              on this intent.
            </p>
          )}
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topo-muted)]">
              Steps
            </div>
            <TextArea
              aria-label="Traditional steps"
              value={stepsDraft}
              onChange={(e) => {
                setStepsDraft(e.target.value);
                setSaveOk(false);
              }}
              readOnly={!canEditTraditional}
              className="min-h-[7rem] w-full font-mono text-xs"
            />
          </div>
          <div>
            <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topo-muted)]">
              Expected result
            </div>
            <TextArea
              aria-label="Expected result"
              value={expectedDraft}
              onChange={(e) => {
                setExpectedDraft(e.target.value);
                setSaveOk(false);
              }}
              readOnly={!canEditTraditional}
              className="min-h-[4rem] w-full font-mono text-xs"
            />
          </div>
          {canEditTraditional ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onPress={() => void saveTraditional()}
                isDisabled={saving || !dirtyTraditional}
              >
                {saving ? "Saving…" : "Save steps"}
              </Button>
              {saveOk && !dirtyTraditional ? (
                <span className="text-xs text-emerald-700 dark:text-emerald-300">
                  Saved
                </span>
              ) : null}
              {saveError ? (
                <span className="text-xs text-red-700 dark:text-red-300">
                  {saveError}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {!loading && view === "bdd" ? (
        <div className="mt-3 space-y-3">
          <p className="text-xs text-[color:var(--topo-muted)]">
            Edit Gherkin; Save writes representationJson on this intent.
          </p>
          <TextArea
            aria-label="BDD Gherkin"
            value={bddDraft}
            onChange={(e) => {
              setBddDraft(e.target.value);
              setSaveOk(false);
            }}
            className="min-h-[8rem] w-full font-mono text-xs"
            data-testid="representation-bdd-edit"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onPress={() => void saveCanonical(parseRepresentation(bddDraft))}
              isDisabled={saving || !bddDraft.trim()}
            >
              {saving ? "Saving…" : "Save BDD"}
            </Button>
            {saveOk ? (
              <span className="text-xs text-emerald-700 dark:text-emerald-300">
                Saved
              </span>
            ) : null}
            {saveError ? (
              <span className="text-xs text-red-700 dark:text-red-300">
                {saveError}
              </span>
            ) : null}
          </div>
          {!empty ? (
            <pre
              className="whitespace-pre-wrap rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-paper)] p-3 font-mono text-[11px] text-[color:var(--topo-ink)]"
              data-testid="representation-bdd"
            >
              {toGherkin(liveStructured, { scenario: intentTitle })}
            </pre>
          ) : null}
        </div>
      ) : null}

      {!loading && view === "natural" && !empty ? (
        <p
          className="mt-3 text-sm leading-relaxed text-[color:var(--topo-ink)]"
          data-testid="representation-natural"
        >
          {toNaturalLanguage(liveStructured)}
        </p>
      ) : null}

      {!loading && view === "structured" && !empty ? (
        <div className="mt-3 space-y-3" data-testid="representation-structured">
          <StructuredClauseList kind="Given" items={liveStructured.given} />
          <StructuredClauseList kind="When" items={liveStructured.when} />
          <StructuredClauseList kind="Then" items={liveStructured.then} />
          <details className="text-xs text-[color:var(--topo-muted)]">
            <summary className="cursor-pointer font-mono uppercase tracking-[0.12em]">
              Steps table
            </summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5 font-mono text-[11px] text-[color:var(--topo-ink)]">
              {toStepTable(liveStructured).map((row) => (
                <li key={`${row.order}-${row.kind}`}>
                  <span className="uppercase text-[color:var(--topo-muted)]">
                    [{row.kind}]
                  </span>{" "}
                  {row.text}
                </li>
              ))}
            </ol>
          </details>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => void saveCanonical(liveStructured)}
            isDisabled={saving}
          >
            Save structured JSON
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StructuredClauseList({
  kind,
  items,
}: {
  kind: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
        {kind}
      </div>
      <ul className="mt-1 space-y-1">
        {items.map((text) => (
          <li
            key={`${kind}-${text}`}
            className="rounded-sm border border-[color:var(--topo-line)] px-2.5 py-1.5 text-sm text-[color:var(--topo-ink)]"
          >
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}
