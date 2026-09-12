"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";

type RunPulse = {
  id: string;
  name: string;
  status: string;
  kind?: string;
  passed?: number;
  failed?: number;
  untested?: number;
};

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
  recentRuns: RunPulse[];
  runTrend?: RunPulse[];
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

function WidgetCard({
  children,
  className = "",
  delay = 0,
  reduceMotion,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  reduceMotion: boolean | null;
}) {
  return (
    <motion.section
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduceMotion ? 0 : delay, duration: 0.28 }}
      className={`rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] ${className}`}
    >
      {children}
    </motion.section>
  );
}

function WidgetLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
      {children}
    </div>
  );
}

function PassFailGraph({
  trend,
  flakeSuspects,
}: {
  trend: RunPulse[];
  flakeSuspects: number;
}) {
  const bars = trend.slice(0, 8).reverse();
  const max = Math.max(
    1,
    ...bars.map((run) => (run.passed ?? 0) + (run.failed ?? 0)),
  );
  const chartHeight = 112;

  if (bars.length === 0) {
    return (
      <p className="mt-4 border border-dashed border-[color:var(--topo-line)] px-3 py-6 text-center text-xs text-[color:var(--topo-muted)]">
        No run results yet to chart. Execute a run or ingest JUnit.
      </p>
    );
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-emerald-500/80" />
          Pass
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm bg-red-500/80" />
          Fail
        </span>
        {flakeSuspects > 0 ? (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm bg-[color:var(--topo-signal)]" />
            Flake {flakeSuspects}
          </span>
        ) : null}
      </div>
      <div
        className="flex items-end gap-1.5 sm:gap-2"
        style={{ height: chartHeight }}
        role="img"
        aria-label="Pass versus fail counts across recent runs"
      >
        {bars.map((run) => {
          const passed = run.passed ?? 0;
          const failed = run.failed ?? 0;
          const executed = passed + failed;
          const barPx =
            executed === 0
              ? 10
              : Math.max(16, Math.round((executed / max) * (chartHeight - 18)));
          return (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              title={`${run.name}: ${passed} pass · ${failed} fail`}
              className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1"
            >
              <div
                className="flex w-full max-w-10 flex-col-reverse overflow-hidden rounded-sm border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] transition group-hover:border-[color:var(--topo-accent)]/40"
                style={{ height: barPx }}
              >
                {executed === 0 ? (
                  <div className="h-full w-full bg-[color:var(--topo-chip)]" />
                ) : (
                  <>
                    {passed > 0 ? (
                      <div
                        className="w-full min-h-[3px] bg-emerald-500/85"
                        style={{ flex: passed }}
                      />
                    ) : null}
                    {failed > 0 ? (
                      <div
                        className="w-full min-h-[3px] bg-red-500/85"
                        style={{ flex: failed }}
                      />
                    ) : null}
                  </>
                )}
              </div>
              <span className="w-full truncate text-center font-mono text-[9px] leading-none text-[color:var(--topo-muted)] group-hover:text-[color:var(--topo-accent)]">
                {run.name.slice(0, 6)}
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function HubPulse({
  pulse,
  milestone,
}: {
  pulse: Pulse;
  milestone: MilestoneView;
}) {
  const health = pulse.quality?.health ?? "healthy";
  const reduceMotion = useReducedMotion();
  const flakeSuspects = pulse.flakeSuspects ?? pulse.quality?.flakeSuspects ?? 0;
  const trend = pulse.runTrend ?? pulse.recentRuns;
  const passRateLabel =
    pulse.results.passRate == null ? "n/a" : `${pulse.results.passRate}%`;

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
              href="/settings?section=ci"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              CI setup
            </Link>
            <Link
              href="/runs"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              Test Runs
            </Link>
            <Link
              href="/reports"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              Reports
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        {/* 1. Highest: quality + pass rate + pass/fail graph */}
        <WidgetCard
          reduceMotion={reduceMotion}
          delay={0.02}
          className="flex min-h-[280px] flex-col p-4 sm:col-span-2 lg:col-span-3 lg:col-start-1 lg:row-span-2 lg:row-start-1"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <WidgetLabel>Overall quality</WidgetLabel>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <span className="text-3xl font-semibold capitalize tracking-tight text-[color:var(--topo-ink)]">
                  {health}
                </span>
                <StatusChip tone={statusToneForRun(health)}>{health}</StatusChip>
              </div>
              <p className="mt-1 max-w-sm text-xs text-[color:var(--topo-muted)]">
                {pulse.quality?.signals[0] ?? "Pulse steady"}
              </p>
            </div>
            <div className="text-right">
              <WidgetLabel>Pass rate</WidgetLabel>
              <div className="mt-1 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--topo-ink)]">
                {passRateLabel}
              </div>
              <p className="mt-1 text-[11px] text-[color:var(--topo-muted)]">
                {pulse.results.passed} pass · {pulse.results.failed} fail
                {flakeSuspects > 0 ? ` · ${flakeSuspects} flake` : ""}
              </p>
            </div>
          </div>

          <div className="mt-4 h-px bg-[color:var(--topo-line)]" />

          <div className="flex flex-1 flex-col">
            <WidgetLabel>Pass / fail trend</WidgetLabel>
            <PassFailGraph trend={trend} flakeSuspects={flakeSuspects} />
          </div>
        </WidgetCard>

        {/* 2. Milestone readiness gate */}
        <WidgetCard
          reduceMotion={reduceMotion}
          delay={0.05}
          className="flex h-full flex-col p-4 sm:col-span-1 lg:col-span-3 lg:col-start-4 lg:row-start-1"
        >
          {milestone ? (
            <div className="flex h-full flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <WidgetLabel>Milestone gate</WidgetLabel>
                <div className="mt-1.5 truncate text-lg font-semibold text-[color:var(--topo-ink)]">
                  {milestone.milestone.name}
                </div>
                <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
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
                <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-[color:var(--topo-ink)]">
                  {milestone.readiness.score}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                  score
                </div>
              </div>
            </div>
          ) : (
            <>
              <WidgetLabel>Milestone gate</WidgetLabel>
              <p className="mt-3 text-sm text-[color:var(--topo-muted)]">
                No active milestone. Set one to gate release readiness.
              </p>
            </>
          )}
        </WidgetCard>

        {/* 3. Cases ready / blocked */}
        <WidgetCard
          reduceMotion={reduceMotion}
          delay={0.08}
          className="flex h-full flex-col p-4 sm:col-span-1 lg:col-span-2 lg:col-start-4 lg:row-start-2"
        >
          <WidgetLabel>Cases ready</WidgetLabel>
          <div className="mt-1.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--topo-ink)]">
            {pulse.cases.ready}
            <span className="text-lg text-[color:var(--topo-muted)]">
              /{pulse.cases.total}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[color:var(--topo-muted)]">
            {pulse.cases.blocked} blocked · {pulse.cases.draft} draft
          </p>
          {pulse.cases.total > 0 ? (
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[color:var(--topo-surface)]">
              <div
                className="h-full rounded-full bg-[color:var(--topo-accent)]"
                style={{
                  width: `${Math.round((pulse.cases.ready / pulse.cases.total) * 100)}%`,
                }}
              />
            </div>
          ) : null}
        </WidgetCard>

        {/* 4. Active runs */}
        <WidgetCard
          reduceMotion={reduceMotion}
          delay={0.1}
          className="flex h-full flex-col p-4 sm:col-span-1 lg:col-span-1 lg:col-start-6 lg:row-start-2"
        >
          <WidgetLabel>Active runs</WidgetLabel>
          <div className="mt-1.5 font-mono text-3xl font-semibold tabular-nums tracking-tight text-[color:var(--topo-ink)]">
            {pulse.runs.inProgress}
          </div>
          <p className="mt-1 text-[11px] text-[color:var(--topo-muted)]">
            {pulse.runs.automation ?? 0} CI · {pulse.runs.completed} done
          </p>
        </WidgetCard>

        {/* 5. Recent runs — wide span */}
        <WidgetCard
          reduceMotion={reduceMotion}
          delay={0.12}
          className="overflow-hidden sm:col-span-2 lg:col-span-6 lg:col-start-1 lg:row-start-3"
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--topo-line)] px-4 py-3">
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
            <p className="px-4 py-8 text-center text-sm text-[color:var(--topo-muted)]">
              No runs yet. Create one from Manual runs or submit JUnit via CLI.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--topo-line)]">
              {pulse.recentRuns.map((run) => {
                const passed = run.passed ?? 0;
                const failed = run.failed ?? 0;
                const executed = passed + failed;
                return (
                  <li key={run.id}>
                    <Link
                      href={`/runs/${run.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-[color:var(--topo-chip)]/60"
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
                          {executed > 0 ? (
                            <span className="font-mono text-[10px] text-[color:var(--topo-muted)]">
                              {passed}P / {failed}F
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <StatusChip tone={statusToneForRun(run.status)} mono>
                        {run.status.replace("_", " ")}
                      </StatusChip>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </WidgetCard>
      </div>
    </div>
  );
}
