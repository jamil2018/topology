"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { PageHeader } from "./page-header";
import { StatusChip, statusToneForRun } from "./status-chip";

type RunRow = {
  id: string;
  name: string;
  status: string;
  source: string;
  branch: string | null;
  commitSha: string | null;
  shardTotal: number;
  shardsReceived: number;
  updatedAt: string | Date;
};

type FlakeHint = {
  caseId: string;
  caseKey: string;
  title: string;
  score: number;
  hint: string;
};

type ReliabilityHint = {
  overallPassRate: number | null;
  sampleCount: number;
  byBrowser: Array<{
    browser: string;
    passRate: number | null;
    sampleCount: number;
  }>;
  summary: string;
};

export function AutomationWorkspace({
  initialRuns,
  flakeHints = [],
  reliabilityHint = null,
}: {
  initialRuns: RunRow[];
  flakeHints?: FlakeHint[];
  reliabilityHint?: ReliabilityHint | null;
}) {
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="CI"
        title="Automation"
        description="CI threads ingested via the Topology CLI. Failures surface in Triage; lightweight flake signals highlight flip-flopping tests."
        meta={
          <>
            <StatusChip mono>{initialRuns.length} threads</StatusChip>
            {flakeHints.length > 0 ? (
              <StatusChip tone="warning" mono>
                {flakeHints.length} flake
              </StatusChip>
            ) : null}
            {reliabilityHint?.overallPassRate != null ? (
              <StatusChip tone="accent" mono>
                {reliabilityHint.overallPassRate}% env pass
              </StatusChip>
            ) : null}
          </>
        }
      />

      <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3 text-sm text-[color:var(--topo-muted)]">
        <p className="font-medium text-[color:var(--topo-ink)]">CLI quick path</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[color:var(--topo-ink)]">
{`export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=topo_demo_token_local_dev_only
npx topology runs create --name "CI build" --source github --shards 2
npx topology runs submit-thread --run-id <id> --shard 1 --file report.xml
npx topology runs complete --run-id <id>`}
        </pre>
        <p className="mt-2 text-xs">
          Full setup lives in{" "}
          <Link
            href="/settings?section=integrations#ci"
            className="text-[color:var(--topo-accent)] underline-offset-2 hover:underline"
          >
            Settings → CI
          </Link>
          .
        </p>
      </div>

      {reliabilityHint ? (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Browser reliability
          </h2>
          <p className="text-xs text-[color:var(--topo-muted)]">
            Pass rate from recent automation results that carry browser/os
            environment metadata.
          </p>
          <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-2.5 text-sm text-[color:var(--topo-ink)]">
            <p>{reliabilityHint.summary}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {reliabilityHint.byBrowser.map((slice) => (
                <StatusChip key={slice.browser} mono>
                  {slice.browser}{" "}
                  {slice.passRate == null ? "—" : `${slice.passRate}%`}
                </StatusChip>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Automation runs
          </h2>
          <Link
            href="/triage"
            className="font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)] hover:text-[color:var(--topo-accent)]"
          >
            Open triage
          </Link>
        </div>
        {initialRuns.length === 0 ? (
          <p className="border border-dashed border-[color:var(--topo-line)] px-3 py-8 text-center text-sm text-[color:var(--topo-muted)]">
            No automation runs yet. Submit a JUnit file with the CLI to populate
            this browser.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
            {initialRuns.map((run, i) => (
              <motion.li
                key={run.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 10) * 0.02 }}
              >
                <Link
                  href={`/runs/${run.id}`}
                  className="flex flex-col gap-1.5 px-3 py-2.5 hover:bg-[color:var(--topo-chip)]/50 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-[color:var(--topo-ink)]">
                      {run.name}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusChip>{run.source}</StatusChip>
                      {run.branch ? (
                        <StatusChip mono>{run.branch}</StatusChip>
                      ) : null}
                      {run.commitSha ? (
                        <StatusChip mono>
                          {run.commitSha.slice(0, 7)}
                        </StatusChip>
                      ) : null}
                      <span className="font-mono text-[10px] text-[color:var(--topo-muted)]">
                        {run.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip tone="neutral" mono>
                      shards {run.shardsReceived}/{run.shardTotal}
                    </StatusChip>
                    <StatusChip tone={statusToneForRun(run.status)} mono>
                      {run.status.replace("_", " ")}
                    </StatusChip>
                  </div>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
          Lightweight flake
        </h2>
        <p className="text-xs text-[color:var(--topo-muted)]">
          Pass/fail flips across recent automation history. High scores are
          demoted in triage so real regressions stay on top.
        </p>
        {flakeHints.length === 0 ? (
          <p className="text-sm text-[color:var(--topo-muted)]">
            No flake suspects in recent history.
          </p>
        ) : (
          <ul className="divide-y divide-[color:var(--topo-line)] overflow-hidden rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
            {flakeHints.map((hint, i) => (
              <motion.li
                key={hint.caseId}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.02 }}
                className="px-3 py-2.5 text-sm"
              >
                <div className="flex flex-wrap items-center gap-2 text-[color:var(--topo-ink)]">
                  <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                    {hint.caseKey}
                  </span>
                  <span className="truncate font-medium">{hint.title}</span>
                  <StatusChip tone="warning" mono>
                    score {hint.score}
                  </StatusChip>
                </div>
                <div className="mt-1 text-xs text-[color:var(--topo-muted)]">
                  {hint.hint}
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
