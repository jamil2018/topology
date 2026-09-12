"use client";

import Link from "next/link";
import { StatusChip } from "./status-chip";

export function CiSetupPanel() {
  return (
    <div className="space-y-3">
      <p className="text-sm text-[color:var(--topo-muted)]">
        Ingest JUnit from GitHub Actions or Jenkins with the Topology CLI.
        Run history lives on{" "}
        <Link
          href="/runs"
          className="font-medium text-[color:var(--topo-ink)] underline-offset-2 hover:underline"
        >
          Runs
        </Link>{" "}
        and the hub pulse — this section is token and setup only.
      </p>

      <div className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-3 text-sm text-[color:var(--topo-muted)]">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-[color:var(--topo-ink)]">CLI quick path</p>
          <StatusChip mono>TOPOLOGY_API_TOKEN</StatusChip>
        </div>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-[color:var(--topo-ink)]">
{`export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=topo_demo_token_local_dev_only
npx topology runs create --name "CI build" --source github --shards 2
npx topology runs submit-thread --run-id <id> --shard 1 --file report.xml
npx topology runs complete --run-id <id>`}
        </pre>
      </div>

      <p className="text-xs text-[color:var(--topo-muted)]">
        Local demo token is seeded as{" "}
        <code className="font-mono">topo_demo_token_local_dev_only</code> (see{" "}
        <code className="font-mono">.env.example</code>). CI ingest endpoints under{" "}
        <code className="font-mono">/api/ci/*</code> stay token-authenticated.
      </p>
    </div>
  );
}
