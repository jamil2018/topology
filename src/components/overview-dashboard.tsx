"use client";

import Link from "next/link";
import { useReducedMotion } from "motion/react";
import { formatStatusLabel } from "@/lib/format-labels";
import { StatusChip, statusToneForRun } from "./status-chip";
import { useQualityGraph } from "./quality-graph-provider";
import {
  CoverageBar,
  PassFailGraph,
  WidgetCard,
  WidgetLabel,
  gapHref,
  gapLabel,
} from "./hub-widgets";
import {
  ALL_HUB_SECTIONS,
  PERSONA_SECTIONS,
  type HubPersona,
  type HubPulseData,
  type MilestoneView,
  type ReleaseOption,
} from "./hub-types";

export function OverviewDashboard({
  pulse,
  milestone,
  persona,
  selectedRelease,
}: {
  pulse: HubPulseData;
  milestone: MilestoneView;
  persona: HubPersona | null;
  selectedRelease: ReleaseOption | null;
}) {
  const { enabled: qualityGraphEnabled } = useQualityGraph();
  const health = pulse.quality?.health ?? "healthy";
  const reduceMotion = useReducedMotion();
  const flakeSuspects = pulse.flakeSuspects ?? pulse.quality?.flakeSuspects ?? 0;
  const trend = pulse.runTrend ?? pulse.recentRuns;
  const passRateLabel =
    pulse.results.passRate == null ? "n/a" : `${pulse.results.passRate}%`;
  const sections = persona ? PERSONA_SECTIONS[persona] : ALL_HUB_SECTIONS;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
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

      {sections.coverage && qualityGraphEnabled ? (
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
                href="/risks"
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
                href="/cases?q=automation"
              />
              <CoverageBar
                label="Execution"
                dimension={pulse.coverage.execution}
                href="/cases"
              />
            </div>
          ) : (
            <p className="text-xs text-[color:var(--topo-muted)]">
              Coverage unavailable until intents are backfilled.
            </p>
          )}
        </WidgetCard>
      ) : null}

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
                    href={gapHref(gap.key)}
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
                        {formatStatusLabel(run.status)}
                      </StatusChip>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </WidgetCard>
      ) : null}

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
  );
}
