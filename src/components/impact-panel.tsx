"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button, Input } from "@heroui/react";
import { abortCleanup, isAbortError } from "@/lib/abort";
import { gapHref, gapLabel } from "./hub-widgets";
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

type PullRequestRow = {
  id: string;
  number: number;
  title: string | null;
  status: string;
  head: string | null;
};

function entityHref(
  kind: "intent" | "requirement" | "component",
  item: ImpactEntity,
): string {
  if (kind === "intent") {
    return item.id
      ? `/intents?intent=${encodeURIComponent(item.id)}`
      : "/intents";
  }
  if (kind === "requirement") {
    return item.id
      ? `/requirements?requirement=${encodeURIComponent(item.id)}`
      : "/requirements";
  }
  return "/components";
}

function EntityList({
  title,
  kind,
  items,
}: {
  title: string;
  kind: "intent" | "requirement" | "component";
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
          <li key={item.key}>
            <Link
              href={entityHref(kind, item)}
              className="font-mono text-xs text-[color:var(--topo-accent)] underline-offset-2 hover:underline"
            >
              {item.key}
            </Link>
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
  const { can, projectId } = useProjectActions();
  const [pending, startTransition] = useTransition();
  const [draftPending, setDraftPending] = useState(false);
  const [commitSha, setCommitSha] = useState("");
  const [prNumber, setPrNumber] = useState("");
  const [pathsCsv, setPathsCsv] = useState("");
  const [result, setResult] = useState<AffectedResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draftMessage, setDraftMessage] = useState<string | null>(null);
  const [recentPrs, setRecentPrs] = useState<PullRequestRow[]>([]);
  const [reposConnected, setReposConnected] = useState<boolean | null>(null);

  useEffect(() => {
    setResult(null);
    setRecentPrs([]);
    setReposConnected(null);
    setError(null);
    setDraftMessage(null);

    const controller = new AbortController();
    let cancelled = false;
    const headers: HeadersInit = projectId
      ? { "x-topology-project-id": projectId }
      : {};
    void (async () => {
      try {
        // allSettled so dual-fetch abort rejects never escape as unhandled.
        const [prSettled, repoSettled] = await Promise.allSettled([
          fetch("/api/pull-requests", { signal: controller.signal, headers }),
          fetch("/api/repositories", { signal: controller.signal, headers }),
        ]);
        if (cancelled || controller.signal.aborted) return;

        if (repoSettled.status === "rejected") {
          if (isAbortError(repoSettled.reason)) return;
          setReposConnected(false);
        } else if (repoSettled.value.ok) {
          const repoData = (await repoSettled.value.json()) as {
            repositories?: unknown[];
          };
          if (cancelled || controller.signal.aborted) return;
          setReposConnected((repoData.repositories?.length ?? 0) > 0);
        } else {
          setReposConnected(false);
        }

        if (prSettled.status === "rejected") {
          if (isAbortError(prSettled.reason)) return;
        } else if (prSettled.value.ok) {
          const prData = (await prSettled.value.json()) as {
            pullRequests?: PullRequestRow[];
          };
          if (cancelled || controller.signal.aborted) return;
          setRecentPrs((prData.pullRequests ?? []).slice(0, 8));
        }
      } catch (error) {
        if (cancelled || controller.signal.aborted || isAbortError(error)) return;
        setReposConnected(false);
      }
    })().catch((error) => {
      if (cancelled || controller.signal.aborted || isAbortError(error)) return;
    });
    return () => {
      cancelled = true;
      abortCleanup(controller);
    };
  }, [projectId]);

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
        headers: {
          "Content-Type": "application/json",
          ...(projectId ? { "x-topology-project-id": projectId } : {}),
        },
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

  function selectPullRequest(pr: PullRequestRow) {
    setPrNumber(String(pr.number));
    if (pr.head?.trim()) {
      setCommitSha(pr.head.trim());
    }
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
        headers: {
          "Content-Type": "application/json",
          ...(projectId ? { "x-topology-project-id": projectId } : {}),
        },
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

      {reposConnected === false ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
          No repository connected.{" "}
          <Link
            href="/settings?section=integrations#repositories"
            className="underline"
          >
            Connect a repository
          </Link>{" "}
          to pick from recent PRs.
        </p>
      ) : recentPrs.length > 0 ? (
        <div className="space-y-1.5">
          <div className="font-medium text-xs text-[color:var(--topo-muted)]">
            Recent pull requests
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {recentPrs.map((pr) => {
              const selected = prNumber.trim() === String(pr.number);
              return (
                <li key={pr.id}>
                  <Button
                    type="button"
                    size="sm"
                    variant={selected ? "secondary" : "tertiary"}
                    onPress={() => selectPullRequest(pr)}
                    className={`h-auto rounded-md border px-2.5 py-1 text-left text-xs transition ${
                      selected
                        ? "border-[color:var(--topo-accent)] bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                        : "border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] text-[color:var(--topo-ink)] hover:bg-[color:var(--topo-chip)]/60"
                    }`}
                  >
                    <span className="font-mono">#{pr.number}</span>
                    {pr.title ? (
                      <span className="ml-1.5 text-[color:var(--topo-muted)]">
                        {pr.title.length > 40
                          ? `${pr.title.slice(0, 40)}…`
                          : pr.title}
                      </span>
                    ) : null}
                  </Button>
                </li>
              );
            })}
          </ul>
        </div>
      ) : reposConnected ? (
        <p className="text-xs text-[color:var(--topo-muted)]">
          No synced pull requests yet. Enter a PR number or commit SHA above.
        </p>
      ) : null}

      <Button
        variant="primary"
        size="sm"
        isDisabled={pending}
        onPress={runAnalysis}
      >
        Analyze impact
      </Button>

      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
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
          <EntityList
            title="Intents"
            kind="intent"
            items={result.impact.intents}
          />
          <EntityList
            title="Requirements"
            kind="requirement"
            items={result.impact.requirements}
          />
          <EntityList
            title="Components"
            kind="component"
            items={result.impact.components}
          />
          {result.impact.gaps.length > 0 ? (
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[color:var(--topo-muted)]">
                Gaps ({result.impact.gaps.length})
              </h3>
              <ul className="space-y-1 text-sm text-[color:var(--topo-ink)]">
                {result.impact.gaps.map((g, i) => {
                  const href = gapHref(g.kind, g.id ?? g.key, g.key);
                  return (
                    <li key={`${g.kind}-${g.key}-${i}`}>
                      <Link
                        href={href}
                        className="font-mono text-xs text-[color:var(--topo-accent)] underline-offset-2 hover:underline"
                      >
                        {gapLabel(g.kind)}
                      </Link>{" "}
                      <span className="font-mono text-xs">{g.key}</span>
                      {g.title ? (
                        <span className="text-[color:var(--topo-muted)]">
                          {" "}
                          — {g.title}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
