"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";
import {
  type HubPersona,
  parseHubPersona,
} from "@/lib/hub-persona";

export type { HubPersona };
export { parseHubPersona };

const PERSONAS: Array<{ id: HubPersona; label: string }> = [
  { id: "em", label: "EM" },
  { id: "qa", label: "QA" },
  { id: "dev", label: "Dev" },
  { id: "pm", label: "PM" },
];

/** Client-only Hub section visibility by persona (Phase 8). */
const PERSONA_SECTIONS: Record<
  HubPersona,
  {
    casesLink: boolean;
    quality: boolean;
    milestone: boolean;
    casesReady: boolean;
    activeRuns: boolean;
    coverage: boolean;
    gaps: boolean;
    recentRuns: boolean;
    retest: boolean;
  }
> = {
  em: {
    casesLink: false,
    quality: true,
    milestone: true,
    casesReady: false,
    activeRuns: false,
    coverage: true,
    gaps: true,
    recentRuns: false,
    retest: false,
  },
  qa: {
    casesLink: true,
    quality: true,
    milestone: true,
    casesReady: true,
    activeRuns: true,
    coverage: false,
    gaps: false,
    recentRuns: true,
    retest: true,
  },
  dev: {
    casesLink: false,
    quality: true,
    milestone: false,
    casesReady: false,
    activeRuns: true,
    coverage: true,
    gaps: true,
    recentRuns: true,
    retest: false,
  },
  pm: {
    casesLink: false,
    quality: false,
    milestone: true,
    casesReady: false,
    activeRuns: false,
    coverage: true,
    gaps: true,
    recentRuns: false,
    retest: false,
  },
};

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
  retestQueue?: Array<{
    id: string;
    key: string;
    title: string;
    caseKey: string | null;
    runId: string | null;
    resultId: string | null;
  }>;
  coverage?: {
    requirement: { covered: number; total: number; pct: number | null };
    risk: { covered: number; total: number; pct: number | null };
    automation: { covered: number; total: number; pct: number | null };
    execution: { covered: number; total: number; pct: number | null };
    gaps: Array<{
      kind: string;
      id: string;
      key: string;
      title: string;
    }>;
    freshnessSummary?: { fresh: number; unverified: number };
  };
  journeyCoverage?: { covered: number; total: number; pct: number | null };
};

type ReleaseOption = {
  id: string;
  name: string;
  gitTag: string | null;
  sha: string | null;
};

type MilestoneView = {
  milestone: {
    name: string;
    passRateThreshold: number;
    minExecutedPct?: number;
  };
  readiness: {
    status: "go" | "at_risk" | "no_go" | "unknown";
    score: number;
    passRate: number | null;
    executedPct?: number;
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

function CoverageBar({
  label,
  dimension,
  href,
}: {
  label: string;
  dimension: { covered: number; total: number; pct: number | null };
  href: string;
}) {
  const na = dimension.pct == null;
  return (
    <Link href={href} className="block rounded-sm transition hover:bg-[color:var(--topo-chip)]/40">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
          {label}
        </span>
        <span className="font-mono text-xs tabular-nums text-[color:var(--topo-ink)]">
          {na ? "n/a" : `${dimension.pct}%`}
          {!na ? (
            <span className="text-[color:var(--topo-muted)]">
              {" "}
              ({dimension.covered}/{dimension.total})
            </span>
          ) : dimension.total === 0 ? (
            <span className="text-[color:var(--topo-muted)]"> · none yet</span>
          ) : null}
        </span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[color:var(--topo-surface)]">
        <div
          className="h-full rounded-full bg-[color:var(--topo-accent)]"
          style={{ width: na ? "0%" : `${dimension.pct}%` }}
        />
      </div>
    </Link>
  );
}

function gapLabel(kind: string) {
  if (kind === "uncovered_requirement") return "Uncovered requirement";
  if (kind === "manual_only_p0") return "P0 manual-only";
  if (kind === "never_executed") return "Never executed";
  return kind;
}

function gapHref(kind: string, id: string) {
  if (kind === "uncovered_requirement") return `/requirements`;
  return `/intents?intent=${id}`;
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
  releases = [],
  selectedReleaseId = null,
  initialPersona = null,
}: {
  pulse: Pulse;
  milestone: MilestoneView;
  releases?: ReleaseOption[];
  selectedReleaseId?: string | null;
  initialPersona?: HubPersona | null;
}) {
  const health = pulse.quality?.health ?? "healthy";
  const reduceMotion = useReducedMotion();
  const flakeSuspects = pulse.flakeSuspects ?? pulse.quality?.flakeSuspects ?? 0;
  const trend = pulse.runTrend ?? pulse.recentRuns;
  const passRateLabel =
    pulse.results.passRate == null ? "n/a" : `${pulse.results.passRate}%`;
  const selectedRelease =
    releases.find((r) => r.id === selectedReleaseId) ?? releases[0] ?? null;
  const router = useRouter();
  const [persona, setPersonaState] = useState<HubPersona | null>(initialPersona);
  const sections = persona
    ? PERSONA_SECTIONS[persona]
    : {
        casesLink: true,
        quality: true,
        milestone: true,
        casesReady: true,
        activeRuns: true,
        coverage: true,
        gaps: true,
        recentRuns: true,
        retest: true,
      };

  function setPersona(next: HubPersona | null) {
    setPersonaState(next);
    const params = new URLSearchParams(
      typeof window !== "undefined" ? window.location.search : "",
    );
    if (next) params.set("persona", next);
    else params.delete("persona");
    if (selectedRelease?.id) params.set("release", selectedRelease.id);
    const qs = params.toString();
    router.replace(qs ? `/?${qs}` : "/", { scroll: false });
  }

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
            {selectedRelease ? (
              <StatusChip mono>{selectedRelease.name}</StatusChip>
            ) : null}
            {persona ? <StatusChip mono>persona {persona}</StatusChip> : null}
          </>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-0.5">
              <button
                type="button"
                onClick={() => setPersona(null)}
                className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
                  persona == null
                    ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                    : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                }`}
              >
                All
              </button>
              {PERSONAS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setPersona(p.id)}
                  className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wide transition ${
                    persona === p.id
                      ? "bg-[color:var(--topo-chip)] text-[color:var(--topo-ink)]"
                      : "text-[color:var(--topo-muted)] hover:text-[color:var(--topo-ink)]"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {releases.length > 0 ? (
              <label className="flex items-center gap-1.5 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-2 py-1 text-xs text-[color:var(--topo-muted)]">
                Release
                <select
                  className="bg-transparent font-medium text-[color:var(--topo-ink)] outline-none"
                  aria-label="Release switcher"
                  value={selectedRelease?.id ?? ""}
                  onChange={(e) => {
                    const id = e.target.value;
                    const params = new URLSearchParams();
                    if (id) params.set("release", id);
                    if (persona) params.set("persona", persona);
                    const qs = params.toString();
                    router.push(qs ? `/?${qs}` : "/");
                  }}
                >
                  {releases.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <Link
                href="/releases"
                className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
              >
                Releases
              </Link>
            )}
            {sections.casesLink ? (
              <Link
                href="/cases"
                className="rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)] transition active:scale-[0.98]"
              >
                Cases
              </Link>
            ) : null}
            <Link
              href="/intents"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              Intents
            </Link>
            <Link
              href="/settings?section=integrations#ci"
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
              href="/milestones"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              Milestones
            </Link>
            <Link
              href="/automation"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)] transition active:scale-[0.98]"
            >
              Automation
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
        {sections.quality ? (
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
        ) : null}

        {/* 2. Milestone readiness gate */}
        {sections.milestone ? (
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
                  <Link
                    href="/milestones"
                    className="hover:text-[color:var(--topo-accent)]"
                  >
                    {milestone.milestone.name}
                  </Link>
                </div>
                <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
                  {milestone.readiness.reasons[0]}
                  {milestone.readiness.passRate != null
                    ? ` · pass ${milestone.readiness.passRate}% (gate ${milestone.milestone.passRateThreshold}%)`
                    : ""}
                  {milestone.readiness.executedPct != null
                    ? ` · executed ${milestone.readiness.executedPct}%`
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
                No active milestone.{" "}
                <Link
                  href="/milestones"
                  className="text-[color:var(--topo-accent)] underline-offset-2 hover:underline"
                >
                  Create one
                </Link>{" "}
                to gate release readiness.
              </p>
            </>
          )}
        </WidgetCard>
        ) : null}

        {/* 3. Cases ready / blocked */}
        {sections.casesReady ? (
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
        ) : null}

        {/* 4. Active runs */}
        {sections.activeRuns ? (
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
        ) : null}

        {/* Coverage bars */}
        {sections.coverage ? (
        <WidgetCard
          reduceMotion={reduceMotion}
          delay={0.11}
          className="flex flex-col gap-3 p-4 sm:col-span-2 lg:col-span-3 lg:col-start-1 lg:row-start-3"
        >
          <div className="flex items-baseline justify-between gap-2">
            <WidgetLabel>Graph coverage</WidgetLabel>
            <div className="flex gap-2">
              {selectedRelease ? (
                <Link
                  href={`/releases/${selectedRelease.id}`}
                  className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)] hover:text-[color:var(--topo-accent)]"
                >
                  {selectedRelease.name}
                </Link>
              ) : null}
              <Link
                href="/journeys"
                className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)] hover:text-[color:var(--topo-accent)]"
              >
                Journeys
              </Link>
            </div>
          </div>
          {pulse.coverage ? (
            <div className="space-y-3">
              <CoverageBar
                label="Requirements"
                dimension={pulse.coverage.requirement}
                href="/requirements"
              />
              <CoverageBar
                label="Risks"
                dimension={pulse.coverage.risk}
                href="/requirements"
              />
              <CoverageBar
                label="Journeys"
                dimension={
                  pulse.journeyCoverage ?? { covered: 0, total: 0, pct: null }
                }
                href="/journeys"
              />
              <CoverageBar
                label="Automation"
                dimension={pulse.coverage.automation}
                href="/intents"
              />
              <CoverageBar
                label="Execution"
                dimension={pulse.coverage.execution}
                href="/intents"
              />
            </div>
          ) : (
            <p className="text-xs text-[color:var(--topo-muted)]">
              Coverage unavailable until intents are backfilled.
            </p>
          )}
        </WidgetCard>
        ) : null}

        {/* Potential gaps */}
        {sections.gaps ? (
        <WidgetCard
          reduceMotion={reduceMotion}
          delay={0.12}
          className="overflow-hidden sm:col-span-2 lg:col-span-3 lg:col-start-4 lg:row-start-3"
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--topo-line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
              Potential gaps
            </h2>
            <StatusChip
              tone={(pulse.coverage?.gaps.length ?? 0) > 0 ? "warning" : "success"}
              mono
            >
              {pulse.coverage?.gaps.length ?? 0}
            </StatusChip>
          </div>
          {(pulse.coverage?.gaps.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-sm text-[color:var(--topo-muted)]">
              No coverage gaps derived from the graph.
              {pulse.coverage?.requirement.total === 0
                ? " Add requirements to unlock requirement coverage."
                : ""}
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--topo-line)]">
              {(pulse.coverage?.gaps ?? []).slice(0, 8).map((gap) => (
                <li key={`${gap.kind}-${gap.id}`}>
                  <Link
                    href={gapHref(gap.kind, gap.id)}
                    className="flex items-start justify-between gap-2 px-4 py-2.5 text-sm transition-colors hover:bg-[color:var(--topo-chip)]/60"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[color:var(--topo-ink)]">
                        <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                          {gap.key}
                        </span>
                        <span className="text-[color:var(--topo-muted)]">
                          {" "}
                          · {gap.title}
                        </span>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
                        {gapLabel(gap.kind)}
                      </p>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>
        ) : null}

        {/* 5. Recent runs — wide span */}
        {sections.recentRuns ? (
        <WidgetCard
          reduceMotion={reduceMotion}
          delay={0.13}
          className="overflow-hidden sm:col-span-2 lg:col-span-4 lg:col-start-1 lg:row-start-4"
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
        ) : null}

        {/* 6. Retest queue */}
        {sections.retest ? (
        <WidgetCard
          reduceMotion={reduceMotion}
          delay={0.14}
          className="overflow-hidden sm:col-span-2 lg:col-span-2 lg:col-start-5 lg:row-start-4"
        >
          <div className="flex items-baseline justify-between gap-2 border-b border-[color:var(--topo-line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
              Retest queue
            </h2>
            <StatusChip
              tone={(pulse.retestQueue?.length ?? 0) > 0 ? "warning" : "success"}
              mono
            >
              {pulse.retestQueue?.length ?? 0}
            </StatusChip>
          </div>
          {(pulse.retestQueue?.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-sm text-[color:var(--topo-muted)]">
              No cases waiting. When a linked issue closes, it appears here for
              retest.
            </p>
          ) : (
            <ul className="divide-y divide-[color:var(--topo-line)]">
              {(pulse.retestQueue ?? []).map((item) => (
                <li key={item.id} className="px-4 py-2.5 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-[color:var(--topo-ink)]">
                        <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                          {item.key}
                        </span>
                        {item.caseKey ? (
                          <span className="text-[color:var(--topo-muted)]">
                            {" "}
                            · {item.caseKey}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[color:var(--topo-muted)]">
                        {item.title}
                      </p>
                    </div>
                    {item.runId ? (
                      <Link
                        href={`/runs/${item.runId}`}
                        className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-accent)] hover:underline"
                      >
                        Retest
                      </Link>
                    ) : (
                      <Link
                        href="/runs"
                        className="shrink-0 font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-accent)] hover:underline"
                      >
                        Start run
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </WidgetCard>
        ) : null}
      </div>
    </div>
  );
}
