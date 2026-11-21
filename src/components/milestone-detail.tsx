"use client";

import Link from "next/link";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";

type MilestoneDetailProps = {
  detail: {
    milestone: {
      id: string;
      name: string;
      description: string;
      status: string;
      passRateThreshold: number;
      maxOpenP0Failures: number;
      minExecutedPct: number;
      maxOpenBlockers: number;
    };
    readiness: {
      status: "go" | "at_risk" | "no_go" | "unknown";
      score: number;
      passRate: number | null;
      executedPct: number;
      openP0Failures: number;
      openBlockerIssues: number;
      reasons: string[];
    };
    badge: string;
    plans: Array<{
      id: string;
      name: string;
      status: string;
      runCount: number;
    }>;
    activeRuns: Array<{
      id: string;
      name: string;
      status: string;
      planId: string;
      planName: string;
    }>;
    completedRuns: Array<{
      id: string;
      name: string;
      status: string;
      planId: string;
      planName: string;
    }>;
    gateBlockers: {
      reasons: string[];
      issues: Array<{
        id: string;
        title: string;
        provider: string;
        remoteKey: string;
        url: string;
        caseId: string | null;
        caseKey: string | null;
      }>;
    };
  };
};

export function MilestoneDetail({ detail }: MilestoneDetailProps) {
  const { milestone, readiness, badge, plans, activeRuns, completedRuns, gateBlockers } =
    detail;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Release"
        title={milestone.name}
        description={
          milestone.description ||
          "Plans, runs, and gate blockers scoped to this milestone."
        }
        meta={
          <>
            <StatusChip tone={statusToneForRun(readiness.status)}>
              {badge}
            </StatusChip>
            <StatusChip mono>{milestone.status}</StatusChip>
            <StatusChip mono>score {readiness.score}</StatusChip>
          </>
        }
        actions={
          <Link
            href="/milestones"
            className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium"
          >
            All milestones
          </Link>
        }
      />

      <section className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2">
          <div className="font-medium text-xs text-[color:var(--topo-muted)]">
            Pass rate
          </div>
          <div className="font-mono text-lg tabular-nums">
            {readiness.passRate == null ? "n/a" : `${readiness.passRate}%`}
          </div>
          <div className="text-xs text-[color:var(--topo-muted)]">
            gate ≥ {milestone.passRateThreshold}%
          </div>
        </div>
        <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2">
          <div className="font-medium text-xs text-[color:var(--topo-muted)]">
            Executed
          </div>
          <div className="font-mono text-lg tabular-nums">
            {readiness.status === "unknown" ? "n/a" : `${readiness.executedPct}%`}
          </div>
          <div className="text-xs text-[color:var(--topo-muted)]">
            gate ≥ {milestone.minExecutedPct}%
          </div>
        </div>
        <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2">
          <div className="font-medium text-xs text-[color:var(--topo-muted)]">
            Open P0 failures
          </div>
          <div className="font-mono text-lg tabular-nums">
            {readiness.openP0Failures}
          </div>
          <div className="text-xs text-[color:var(--topo-muted)]">
            max {milestone.maxOpenP0Failures}
          </div>
        </div>
        <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2">
          <div className="font-medium text-xs text-[color:var(--topo-muted)]">
            Blockers
          </div>
          <div className="font-mono text-lg tabular-nums">
            {readiness.openBlockerIssues}
          </div>
          <div className="text-xs text-[color:var(--topo-muted)]">
            max {milestone.maxOpenBlockers}
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Linked plans
        </h2>
        {plans.length === 0 ? (
          <p className="text-sm text-[color:var(--topo-muted)]">
            No plans linked to this milestone yet. Assign a milestone from a
            plan detail page.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)] rounded-md border border-[color:var(--topo-line)]">
            {plans.map((plan) => (
              <li key={plan.id}>
                <Link
                  href={`/plans/${plan.id}`}
                  className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-[color:var(--topo-chip)]/60"
                >
                  <span className="font-medium text-[color:var(--topo-ink)]">
                    {plan.name}
                  </span>
                  <span className="flex items-center gap-2">
                    <StatusChip mono>{plan.status}</StatusChip>
                    <StatusChip mono>{plan.runCount} runs</StatusChip>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Active runs
          </h2>
          {activeRuns.length === 0 ? (
            <p className="text-sm text-[color:var(--topo-muted)]">
              No planned or in-progress runs from linked plans.
            </p>
          ) : (
            <ul className="space-y-1">
              {activeRuns.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    className="flex items-center justify-between rounded-md border border-[color:var(--topo-line)] px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{run.name}</span>
                      <span className="ml-2 text-xs text-[color:var(--topo-muted)]">
                        via {run.planName}
                      </span>
                    </span>
                    <StatusChip tone={statusToneForRun(run.status)}>
                      {run.status}
                    </StatusChip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Completed runs
          </h2>
          {completedRuns.length === 0 ? (
            <p className="text-sm text-[color:var(--topo-muted)]">
              No completed runs from linked plans yet.
            </p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {completedRuns.map((run) => (
                <li key={run.id}>
                  <Link
                    href={`/runs/${run.id}`}
                    className="flex items-center justify-between rounded-md border border-[color:var(--topo-line)] px-3 py-2 text-sm"
                  >
                    <span>
                      <span className="font-medium">{run.name}</span>
                      <span className="ml-2 text-xs text-[color:var(--topo-muted)]">
                        via {run.planName}
                      </span>
                    </span>
                    <StatusChip tone={statusToneForRun(run.status)}>
                      {run.status}
                    </StatusChip>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Gate blockers
        </h2>
        {gateBlockers.reasons.length === 0 &&
        gateBlockers.issues.length === 0 ? (
          <p className="text-sm text-[color:var(--topo-muted)]">
            No gate blockers for this milestone.
          </p>
        ) : (
          <div className="space-y-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3">
            {gateBlockers.reasons.length > 0 ? (
              <ul className="space-y-1 text-sm text-[color:var(--topo-muted)]">
                {gateBlockers.reasons.map((reason) => (
                  <li key={reason}>· {reason}</li>
                ))}
              </ul>
            ) : null}
            {gateBlockers.issues.length > 0 ? (
              <ul className="space-y-2">
                {gateBlockers.issues.map((issue) => (
                  <li key={issue.id} className="text-sm">
                    <a
                      href={issue.url}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-[color:var(--topo-ink)] underline"
                    >
                      {issue.remoteKey}: {issue.title}
                    </a>
                    <span className="ml-2 text-xs text-[color:var(--topo-muted)]">
                      {issue.provider}
                      {issue.caseKey ? ` · ${issue.caseKey}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </section>
    </div>
  );
}
