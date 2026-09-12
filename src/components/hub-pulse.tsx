"use client";

import Link from "next/link";
import { motion } from "motion/react";

type Pulse = {
  cases: { total: number; ready: number; blocked: number; draft: number };
  runs: { total: number; inProgress: number; completed: number };
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
  }>;
};

export function HubPulse({ pulse }: { pulse: Pulse }) {
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
            Quality pulse for cases, folders, and manual runs — the first slice
            of a self-hosted TCM built for operators.
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
              href="/runs"
              className="rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-2 text-sm text-[color:var(--topo-ink)]"
            >
              Manual runs
            </Link>
          </motion.div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: "Cases ready",
            value: `${pulse.cases.ready}/${pulse.cases.total}`,
            hint: `${pulse.cases.blocked} blocked · ${pulse.cases.draft} draft`,
          },
          {
            label: "Folders",
            value: String(pulse.folders),
            hint: "Suite structure",
          },
          {
            label: "Active runs",
            value: String(pulse.runs.inProgress),
            hint: `${pulse.runs.completed} completed of ${pulse.runs.total}`,
          },
          {
            label: "Pass rate",
            value:
              pulse.results.passRate == null
                ? "—"
                : `${pulse.results.passRate}%`,
            hint: `${pulse.results.passed} passed · ${pulse.results.failed} failed`,
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
            <div className="mt-2 font-[family-name:var(--font-display)] text-3xl text-[color:var(--topo-ink)]">
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
            No runs yet. Create one from Manual runs.
          </p>
        ) : (
          <ul className="space-y-2">
            {pulse.recentRuns.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/runs/${run.id}`}
                  className="flex items-center justify-between rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-3 text-sm hover:border-[color:var(--topo-accent)]"
                >
                  <span className="text-[color:var(--topo-ink)]">{run.name}</span>
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
