"use client";

import Link from "next/link";
import { motion } from "motion/react";

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
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl text-[color:var(--topo-ink)]">
          Automation runs
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-[color:var(--topo-muted)]">
          CI threads ingested via the Topology CLI — JUnit submit and shard
          merge from GitHub Actions or Jenkins.
        </p>
      </div>

      <div className="rounded-xl border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4 text-sm text-[color:var(--topo-muted)]">
        <p className="font-medium text-[color:var(--topo-ink)]">CLI quick path</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-xs leading-relaxed">
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
        <ul className="space-y-2">
          {initialRuns.map((run, i) => (
            <motion.li
              key={run.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
            >
              <Link
                href={`/runs/${run.id}`}
                className="flex flex-col gap-1 rounded-lg border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-4 py-3 hover:border-[color:var(--topo-accent)] sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="text-sm text-[color:var(--topo-ink)]">
                    {run.name}
                  </div>
                  <div className="mt-1 text-xs text-[color:var(--topo-muted)]">
                    {run.source}
                    {run.branch ? ` · ${run.branch}` : ""}
                    {run.commitSha
                      ? ` · ${run.commitSha.slice(0, 7)}`
                      : ""}
                  </div>
                </div>
                <div className="text-xs capitalize text-[color:var(--topo-muted)]">
                  {run.status.replace("_", " ")} · shards{" "}
                  {run.shardsReceived}/{run.shardTotal}
                </div>
              </Link>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
