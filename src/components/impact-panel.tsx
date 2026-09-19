"use client";

import { useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { StatusChip } from "./status-chip";

type ImpactEntity = { key: string; title?: string };
type GapHint = { kind: string; key: string; title: string };

type AffectedResponse = {
  paths: string[];
  pathsSource?: string;
  summary: {
    components: number;
    requirements: number;
    intents: number;
    implementations: number;
    gaps: number;
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
  const [pending, startTransition] = useTransition();
  const [commitSha, setCommitSha] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [pathsCsv, setPathsCsv] = useState("");
  const [result, setResult] = useState<AffectedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  function runAnalysis() {
    setError(null);
    setResult(null);

    const body: Record<string, unknown> = {};
    const paths = pathsCsv
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (paths.length > 0) body.paths = paths;
    if (commitSha.trim()) body.commitSha = commitSha.trim();
    const pr = Number(prNumber.trim());
    if (prNumber.trim() && Number.isInteger(pr) && pr >= 1) body.pr = pr;

    if (!body.paths && !body.commitSha && body.pr == null) {
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

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
            Commit SHA
          </span>
          <Input
            placeholder="abc1234"
            value={commitSha}
            onChange={(e) => setCommitSha(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
            PR number
          </span>
          <Input
            placeholder="42"
            value={prNumber}
            onChange={(e) => setPrNumber(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
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

      {result ? (
        <div className="space-y-4 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
          <div className="flex flex-wrap gap-2">
            {result.pathsSource ? (
              <StatusChip mono>source: {result.pathsSource}</StatusChip>
            ) : null}
            <StatusChip mono>{result.paths.length} paths</StatusChip>
            <StatusChip>{result.summary.intents} intents</StatusChip>
            <StatusChip>{result.summary.requirements} requirements</StatusChip>
            <StatusChip>{result.summary.gaps} gaps</StatusChip>
          </div>
          {result.paths.length > 0 ? (
            <p className="font-mono text-[10px] leading-relaxed text-[color:var(--topo-muted)]">
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
