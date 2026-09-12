"use client";

import Link from "next/link";
import { motion } from "motion/react";

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

const healthColor = {
  healthy: "text-emerald-800",
  watch: "text-amber-800",
  critical: "text-red-800",
} as const;

const badgeStyles = {
  ready: "bg-emerald-100 text-emerald-900",
  at_risk: "bg-amber-100 text-amber-900",
  blocked: "bg-red-100 text-red-900",
} as const;

export function HubPulse({
  pulse,
  milestone,
}: {
  pulse: Pulse;
  milestone: MilestoneView;
}) {
  const health = pulse.quality?.health ?? "healthy";

  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]/80 topo-grid">
        <div className="relative px-6 py-10 sm:px-10">
          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-xs uppercase tracking-[0.22em] text-[color:var(--topo-muted)]"
          >
            Operating hub
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="mt-2 max-w-2xl font-[family-name:var(--font-display)] text-4xl leading-tight text-[color:var(--topo-ink)] sm:text-5xl"
          >
            Topology
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mt-3 max-w-xl text-base text-[color:var(--topo-muted)]"
          >
            Quality pulse across cases, manual runs, and CI automation —
            triage failures and gate milestones from one hub.
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.16 }}
            className="mt-6 flex flex-wrap gap-3"
          >
            <Link
              href="/cases"
              className="rounded-lg bg-[color:var(--topo-ink)] px-4 py-2 text-sm text-[color:var(--topo-paper)]"
            >
              Open cases
            </Link>
            <Link
              href="/automation"
              className="rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-2 text-sm text-[color:var(--topo-ink)]"
            >
              Automation
            </Link>
            <Link
              href="/triage"
              className="rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-2 text-sm text-[color:var(--topo-ink)]"
            >
              Triage
              {(pulse.triageOpen ?? 0) > 0
                ? ` (${pulse.triageOpen})`
                : ""}
            </Link>
          </motion.div>
        </div>
      </section>

      {milestone ? (
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-4"
        >
          <div>
            <div className="text-xs uppercase tracking-wide text-[color:var(--topo-muted)]">
              Milestone readiness
            </div>
            <div className="mt-1 font-[family-name:var(--font-display)] text-2xl text-[color:var(--topo-ink)]">
              {milestone.milestone.name}
            </div>
            <p className="mt-1 text-xs text-[color:var(--topo-muted)]">
              {milestone.readiness.reasons[0]}
              {milestone.readiness.passRate != null
                ? ` · pass rate ${milestone.readiness.passRate}% (gate ${milestone.milestone.passRateThreshold}%)`
                : ""}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`inline-flex rounded-md px-3 py-1 text-sm font-medium ${badgeStyles[milestone.readiness.status]}`}
            >
              {milestone.badge}
            </span>
            <div className="mt-2 text-xs text-[color:var(--topo-muted)]">
              Score {milestone.readiness.score}
            </div>
          </div>
        </motion.section>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Cases ready",
            value: `${pulse.cases.ready}/${pulse.cases.total}`,
            hint: `${pulse.cases.blocked} blocked · ${pulse.cases.draft} draft`,
          },
          {
            label: "Quality health",
            value: health,
            hint: pulse.quality?.signals[0] ?? "Pulse steady",
            emphasize: healthColor[health],
          },
          {
            label: "Active runs",
            value: String(pulse.runs.inProgress),
            hint: `${pulse.runs.automation ?? 0} automation · ${pulse.runs.completed} completed`,
          },
          {
            label: "Pass rate",
            value:
              pulse.results.passRate == null
                ? "—"
                : `${pulse.results.passRate}%`,
            hint: `${pulse.results.failed} failed · ${pulse.flakeSuspects ?? 0} flake suspects`,
          },
        ].map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 + i * 0.05 }}
            className="rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-4"
          >
            <div className="text-xs uppercase tracking-wide text-[color:var(--topo-muted)]">
              {stat.label}
            </div>
            <div
              className={`mt-2 font-[family-name:var(--font-display)] text-3xl capitalize text-[color:var(--topo-ink)] ${"emphasize" in stat ? stat.emphasize : ""}`}
            >
              {stat.value}
            </div>
            <div className="mt-1 text-xs text-[color:var(--topo-muted)]">
              {stat.hint}
            </div>
          </motion.div>
        ))}
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-[color:var(--topo-ink)]">
          Recent runs
        </h2>
        {pulse.recentRuns.length === 0 ? (
          <p className="text-sm text-[color:var(--topo-muted)]">
            No runs yet. Create one from Manual runs or submit JUnit via CLI.
          </p>
        ) : (
          <ul className="space-y-2">
            {pulse.recentRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-3 text-sm hover:border-[color:var(--topo-accent)]"
                >
                  <span className="text-[color:var(--topo-ink)]">
                    {run.name}
                    {run.kind === "automation" ? (
                      <span className="ml-2 text-xs text-[color:var(--topo-muted)]">
                        CI
                      </span>
                    ) : null}
                  </span>
                  <span className="capitalize text-[color:var(--topo-muted)]">
                    {run.status.replace("_", " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
