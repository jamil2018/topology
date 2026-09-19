"use client";

import Link from "next/link";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

type Dimension = { covered: number; total: number; pct: number | null };

type SnapshotPayload = {
  requirement: Dimension;
  risk: Dimension;
  automation: Dimension;
  execution: Dimension;
  flakeCount: number;
  unverifiedChanges: number;
};

type Quality = {
  affected: { components: number; requirements: number; intents: number };
  execution: {
    executed: number;
    passed: number;
    failed: number;
    notExecuted: number;
    passRate: number | null;
    executedPct: number | null;
  };
  gaps: Array<{
    kind: string;
    id: string;
    key: string;
    title: string;
    reason?: string;
  }>;
};

function DimRow({ label, dim }: { label: string; dim: Dimension }) {
  return (
    <div className="flex items-baseline justify-between gap-2 py-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums text-[color:var(--topo-ink)]">
        {dim.pct == null ? "n/a" : `${dim.pct}%`}
        <span className="text-[color:var(--topo-muted)]">
          {" "}
          ({dim.covered}/{dim.total})
        </span>
      </span>
    </div>
  );
}

function gapHref(kind: string, id: string) {
  if (kind === "uncovered_requirement") return "/requirements";
  return `/intents?intent=${id}`;
}

export function ReleaseDetail({
  release,
  snapshot,
  quality,
  siblings,
}: {
  release: {
    id: string;
    name: string;
    gitTag: string | null;
    sha: string | null;
    milestoneName: string | null;
    releasedAt: Date | string | null;
  };
  snapshot: {
    id: string;
    createdAt: Date | string;
    payload: SnapshotPayload | null;
  } | null;
  quality: Quality | null;
  siblings: Array<{ id: string; name: string }>;
}) {
  const previous = siblings.find((s) => s.id !== release.id);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Release"
        title={release.name}
        description={[
          release.gitTag,
          release.sha ? release.sha.slice(0, 12) : null,
          release.milestoneName,
        ]
          .filter(Boolean)
          .join(" · ") || "No git binding yet"}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link
              href="/releases"
              className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)]"
            >
              All releases
            </Link>
            {previous ? (
              <Link
                href={`/releases/compare?before=${previous.id}&after=${release.id}`}
                className="rounded-md bg-[color:var(--topo-accent)] px-3 py-1.5 text-xs font-medium text-[color:var(--accent-foreground)]"
              >
                Compare vs {previous.name}
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Frozen snapshot
          </h2>
          {snapshot?.payload ? (
            <div className="mt-3 divide-y divide-[color:var(--topo-line)]">
              <DimRow label="Requirements" dim={snapshot.payload.requirement} />
              <DimRow label="Risks" dim={snapshot.payload.risk} />
              <DimRow label="Automation" dim={snapshot.payload.automation} />
              <DimRow label="Execution" dim={snapshot.payload.execution} />
              <div className="flex justify-between py-1.5 font-mono text-xs">
                <span className="text-[color:var(--topo-muted)]">Flake</span>
                <span>{snapshot.payload.flakeCount}</span>
              </div>
              <div className="flex justify-between py-1.5 font-mono text-xs">
                <span className="text-[color:var(--topo-muted)]">Unverified</span>
                <span>{snapshot.payload.unverifiedChanges}</span>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[color:var(--topo-muted)]">
              No snapshot stored for this release.
            </p>
          )}
        </section>

        <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
          <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
            Live workspace quality
          </h2>
          {quality ? (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-mono text-xs text-[color:var(--topo-muted)]">
                Affected · {quality.affected.components} components ·{" "}
                {quality.affected.requirements} reqs · {quality.affected.intents}{" "}
                intents
              </p>
              <p>
                Executed {quality.execution.executed} (
                {quality.execution.executedPct ?? "n/a"}%) · pass{" "}
                {quality.execution.passRate ?? "n/a"}% · not executed{" "}
                {quality.execution.notExecuted}
              </p>
              <div className="flex flex-wrap gap-1.5">
                <StatusChip mono>pass {quality.execution.passed}</StatusChip>
                <StatusChip mono>fail {quality.execution.failed}</StatusChip>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-[color:var(--topo-muted)]">
              Quality summary unavailable.
            </p>
          )}
        </section>
      </div>

      {quality && quality.gaps.length > 0 ? (
        <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)]">
          <div className="border-b border-[color:var(--topo-line)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[color:var(--topo-ink)]">
              Gaps
            </h2>
          </div>
          <ul className="divide-y divide-[color:var(--topo-line)]">
            {quality.gaps.slice(0, 12).map((gap) => (
              <li key={`${gap.kind}-${gap.id}`}>
                <Link
                  href={gapHref(gap.kind, gap.id)}
                  className="block px-4 py-2.5 text-sm transition-colors hover:bg-[color:var(--topo-chip)]/50"
                >
                  <span className="font-mono text-xs text-[color:var(--topo-accent)]">
                    {gap.key}
                  </span>{" "}
                  {gap.title}
                  {gap.reason ? (
                    <span className="mt-0.5 block text-xs text-[color:var(--topo-muted)]">
                      {gap.reason}
                    </span>
                  ) : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
