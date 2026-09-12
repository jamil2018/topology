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

export function AutomationWorkspace({
  initialRuns,
}: {
  initialRuns: RunRow[];
}) {
  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="CI"
        title="Automation"
        description="CI threads ingested via the Topology CLI. JUnit submit and shard merge from GitHub Actions or Jenkins."
        meta={<StatusChip mono>{initialRuns.length} threads</StatusChip>}
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
      </div>

      {initialRuns.length === 0 ? (
        <p className="text-sm text-[color:var(--topo-muted)]">
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
    </div>
  );
}
