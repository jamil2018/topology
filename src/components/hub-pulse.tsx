"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";

type Pulse = {
  cases: { total: number; ready: number; blocked: number; draft: number };
  runs: {
    total: number;
    inProgress: number;
    completed: number;
    automation?: number;
  };
  results: {
    passed: number;
    failed: number;
    untested: number;
    total: number;
    passRate: number | null;
  };
  folders: number;
  recentRuns: Array<{
    id: string;
    name: string;
    status: string;
    kind?: string;
  }>;
  quality?: {
    health: "healthy" | "watch" | "critical";
    signals: string[];
    triageBacklog: number;
    flakeSuspects: number;
  };
  triageOpen?: number;
  flakeSuspects?: number;
};

type MilestoneView = {
  milestone: { name: string; passRateThreshold: number };
  readiness: {
    status: "ready" | "at_risk" | "blocked";
    score: number;
    passRate: number | null;
    reasons: string[];
  };
  badge: string;
} | null;

export function HubPulse({
  pulse,
  milestone,
}: {
  pulse: Pulse;
  milestone: MilestoneView;
}) {
  const health = pulse.quality?.health ?? "healthy";
  const reduceMotion = useReducedMotion();

  const stats = [
    {
      label: "Cases ready",
      value: `${pulse.cases.ready}/${pulse.cases.total}`,
      hint: `${pulse.cases.blocked} blocked · ${pulse.cases.draft} draft`,
      mono: true,
    },
    {
      label: "Quality",
      value: health,
      hint: pulse.quality?.signals[0] ?? "Pulse steady",
      chip: statusToneForRun(health),
    },
    {
      label: "Active runs",
      value: String(pulse.runs.inProgress),
      hint: `${pulse.runs.automation ?? 0} CI · ${pulse.runs.completed} done`,
      mono: true,
    },
    {
      label: "Pass rate",
      value:
        pulse.results.passRate == null ? "n/a" : `${pulse.results.passRate}%`,
      hint: `${pulse.results.failed} failed · ${pulse.flakeSuspects ?? 0} flake`,
      mono: true,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operating hub"
        title="Quality pulse"
        description="Cases, manual runs, and CI automation in one cockpit. Triage failures and gate milestones without leaving the hub."
        meta={
          <>
            <StatusChip tone={statusToneForRun(health)}>{health}</StatusChip>
            {(pulse.triageOpen ?? 0) > 0 ? (
              <StatusChip tone="danger">
                {pulse.triageOpen} open triage
              </StatusChip>
            ) : (
              <StatusChip tone="success">Triage clear</StatusChip>
            )}
            {milestone ? (
              <StatusChip tone={statusToneForRun(milestone.readiness.status)}>
                {milestone.badge}
              </StatusChip>
            ) : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/cases"
              className="rounded-md bg-[color:var(--topo-ink)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-panel)] transition active:scale-[0.98]"
            >
              Cases
            </Link>
            <Link
              href="/automation"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              Automation
            </Link>
            <Link
              href="/triage"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              Triage
              {(pulse.triageOpen ?? 0) > 0 ? ` (${pulse.triageOpen})` : ""}
            </Link>
          </div>
        }
      />

      {milestone ? (
        <section className="flex flex-wrap items-center justify-between gap-3 border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2.5">
          <div className="min-w-0">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
              Milestone
            </div>
            <div className="truncate text-sm font-semibold text-[color:var(--topo-ink)]">
              {milestone.milestone.name}
            </div>
            <p className="mt-0.5 text-xs text-[color:var(--topo-muted)]">
              {milestone.readiness.reasons[0]}
              {milestone.readiness.passRate != null
                ? ` · pass ${milestone.readiness.passRate}% (gate ${milestone.milestone.passRateThreshold}%)`
                : ""}
            </p>
          </div>
          <div className="text-right">
            <StatusChip tone={statusToneForRun(milestone.readiness.status)}>
              {milestone.badge}
            </StatusChip>
            <div className="mt-1 font-mono text-[11px] text-[color:var(--topo-muted)]">
              score {milestone.readiness.score}
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-px overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-line)] lg:grid-cols-4">
        {stats.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={reduceMotion ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduceMotion ? 0 : 0.04 + i * 0.03 }}
            className="bg-[color:var(--topo-panel)] px-3 py-3"
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--topo-muted)]">
              {stat.label}
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span
                className={`text-2xl font-semibold tracking-tight text-[color:var(--topo-ink)] ${
                  "mono" in stat && stat.mono ? "font-mono tabular-nums" : "capitalize"
                }`}
              >
                {stat.value}
              </span>
              {"chip" in stat && stat.chip ? (
                <StatusChip tone={stat.chip}>{health}</StatusChip>
              ) : null}
            </div>
            <div className="mt-1 text-[11px] text-[color:var(--topo-muted)]">
              {stat.hint}
            </div>
          </motion.div>
        ))}
      </section>

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Recent runs
          </h2>
          <Link
            href="/runs"
            className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)] hover:text-[color:var(--topo-accent)]"
          >
            View all
          </Link>
        </div>
        {pulse.recentRuns.length === 0 ? (
          <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
            No runs yet. Create one from Manual runs or submit JUnit via CLI.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
            {pulse.recentRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm transition-colors hover:bg-[color:var(--topo-chip)]/60"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-[color:var(--topo-ink)]">
                      {run.name}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] text-[color:var(--topo-muted)]">
                        {run.id.slice(0, 8)}
                      </span>
                      {run.kind === "automation" ? (
                        <StatusChip tone="info">CI</StatusChip>
                      ) : (
                        <StatusChip>Manual</StatusChip>
                      )}
                    </div>
                  </div>
                  <StatusChip tone={statusToneForRun(run.status)} mono>
                    {run.status.replace("_", " ")}
                  </StatusChip>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
