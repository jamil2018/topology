"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { useProjectActions } from "./project-actions";
import { StatusChip } from "./status-chip";

type ImpactEntity = { id?: string; key: string; title?: string };
type GapHint = { kind: string; key: string; title: string; id?: string };

type AffectedResponse = {
  paths: string[];
  pathsSource?: string;
  caseIds?: string[];
  summary: {
    components: number;
    requirements: number;
    intents: number;
    implementations: number;
    gaps: number;
    cases?: number;
  };
  impact: {
    intents: ImpactEntity[];
    requirements: ImpactEntity[];
    gaps: GapHint[];
    components: ImpactEntity[];
  };
  error?: string;
};

function EntityList({
  title,
  items,
}: {
  title: string;
  items: ImpactEntity[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--topo-muted)]">
        {title} ({items.length})
      </h3>
      <ul className="max-h-40 space-y-0.5 overflow-y-auto text-sm">
        {items.map((item) => (
          <li key={item.key} className="font-mono text-xs text-[color:var(--topo-ink)]">
            {item.key}
            {item.title ? (
              <span className="ml-2 font-sans text-[color:var(--topo-muted)]">
                {item.title}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ImpactPanel() {
  const router = useRouter();
  const { can } = useProjectActions();
  const [pending, startTransition] = useTransition();
  const [draftPending, setDraftPending] = useState(false);
  const [commitSha, setCommitSha] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [pathsCsv, setPathsCsv] = useState("");
  const [result, setResult] = useState<AffectedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);

  function analysisBody(): Record<string, unknown> | null {
    const body: Record<string, unknown> = {};
    const paths = pathsCsv
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (paths.length > 0) body.paths = paths;
    if (commitSha.trim()) body.commitSha = commitSha.trim();
    const pr = Number(prNumber.trim());
    if (prNumber.trim() && Number.isInteger(pr) && pr >= 1) body.pr = pr;
    if (!body.paths && !body.commitSha && body.pr == null) return null;
    return body;
  }

  function runAnalysis() {
    setError(null);
    setResult(null);
    setDraftMessage(null);

    const body = analysisBody();
    if (!body) {
      setError("Enter a commit SHA, PR number, or comma-separated paths");
      return;
    }

    startTransition(async () => {
      const res = await fetch("/api/affected", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as AffectedResponse & {
        error?: string | { formErrors?: string[] };
      };
      if (!res.ok) {
        const errMsg =
          typeof data.error === "string"
            ? data.error
            : "Impact request failed";
        setError(errMsg);
        return;
      }
      setResult(data);
    });
  }

  async function draftMissingTests() {
    if (!can("intents.edit") && !can("proposals.create")) return;
    const body = analysisBody();
    if (!body) {
      setError("Re-enter paths, commit, or PR before drafting");
      return;
    }
    setError(null);
    setDraftMessage(null);
    setDraftPending(true);
    try {
      const res = await fetch("/api/ai/draft?heuristic=1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job: "change_impact",
          ...body,
          allowHeuristic: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        proposalId?: string;
        heuristic?: boolean;
        model?: string;
      };
      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Could not draft coverage proposal",
        );
        return;
      }
      setDraftMessage(
        data.proposalId
          ? `Coverage proposal queued${data.heuristic ? " (local template)" : data.model ? ` (${data.model})` : ""}. Review it under Proposals.`
          : "Draft created.",
      );
      startTransition(() => router.refresh());
    } finally {
      setDraftPending(false);
    }
  }

  const caseIds = result?.caseIds ?? [];
  const targetedRunHref =
    caseIds.length > 0
      ? `/runs/new?cases=${encodeURIComponent(caseIds.join(","))}`
      : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="font-medium text-xs text-[color:var(--topo-muted)]">
            Commit SHA
          </span>
          <Input
            placeholder="abc1234"
            value={commitSha}
            onChange={(e) => setCommitSha(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-xs text-[color:var(--topo-muted)]">
            PR number
          </span>
          <Input
            placeholder="42"
            value={prNumber}
            onChange={(e) => setPrNumber(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-xs text-[color:var(--topo-muted)]">
            Paths (optional override)
          </span>
          <Input
            placeholder="src/a.ts, src/b.ts"
            value={pathsCsv}
            onChange={(e) => setPathsCsv(e.target.value)}
          />
        </label>
      </div>
      <Button
        variant="primary"
        size="sm"
        isDisabled={pending}
        onPress={runAnalysis}
      >
        Analyze impact
      </Button>

      {error ? (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      ) : null}

      {draftMessage ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
          {draftMessage}{" "}
          <Link href="/proposals" className="underline">
            Open Proposals
          </Link>
        </p>
      ) : null}

      {result ? (
        <div className="space-y-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
          <div className="flex flex-wrap gap-2">
            {result.pathsSource ? (
              <StatusChip mono>source: {result.pathsSource}</StatusChip>
            ) : null}
            <StatusChip mono>{result.paths.length} paths</StatusChip>
            <StatusChip>{result.summary.intents} intents</StatusChip>
            <StatusChip>
              {result.summary.cases ?? caseIds.length} cases
            </StatusChip>
            <StatusChip>{result.summary.requirements} requirements</StatusChip>
            <StatusChip>{result.summary.gaps} gaps</StatusChip>
          </div>

          <div className="flex flex-wrap gap-2">
            {targetedRunHref && can("runs.create") ? (
              <Button
                size="sm"
                variant="primary"
                onPress={() => router.push(targetedRunHref)}
              >
                Start targeted run
              </Button>
            ) : (
              <p className="text-xs text-[color:var(--topo-muted)]">
                {caseIds.length === 0
                  ? "No linked cases for affected intents yet."
                  : null}
              </p>
            )}
            {result.impact.gaps.length > 0 &&
            (can("intents.edit") || can("proposals.create")) ? (
              <Button
                size="sm"
                variant="secondary"
                isDisabled={pending || draftPending}
                onPress={() => void draftMissingTests()}
              >
                Draft missing tests
              </Button>
            ) : null}
          </div>

          {result.paths.length > 0 ? (
            <p className="font-mono text-xs leading-relaxed text-[color:var(--topo-muted)]">
              {result.paths.join(", ")}
            </p>
          ) : null}
          <EntityList title="Intents" items={result.impact.intents} />
          <EntityList title="Requirements" items={result.impact.requirements} />
          {result.impact.gaps.length > 0 ? (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--topo-muted)]">
                Gaps ({result.impact.gaps.length})
              </h3>
              <ul className="space-y-1 text-sm text-[color:var(--topo-ink)]">
                {result.impact.gaps.map((g, i) => (
                  <li key={`${g.kind}-${g.key}-${i}`}>
                    <span className="font-mono text-xs">{g.kind}</span>{" "}
                    {g.key}
                    {g.title ? (
                      <span className="text-[color:var(--topo-muted)]">
                        {" "}
                        — {g.title}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
