"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@heroui/react";
import { PageHeader } from "./page-header";
import { StatusChip } from "./status-chip";

type ReleaseOption = { id: string; name: string };

type DimensionDelta = {
  before: { covered: number; total: number; pct: number | null };
  after: { covered: number; total: number; pct: number | null };
  coveredDelta: number;
  totalDelta: number;
  pctDelta: number | null;
};

type CountDelta = { before: number; after: number; delta: number };

type Comparison = {
  requirement: DimensionDelta;
  risk: DimensionDelta;
  automation: DimensionDelta;
  execution: DimensionDelta;
  flakeCount: CountDelta;
  unverifiedChanges: CountDelta;
};

function formatDelta(n: number | null) {
  if (n == null) return "n/a";
  if (n > 0) return `+${n}`;
  return String(n);
}

function DimCompare({
  label,
  dim,
}: {
  label: string;
  dim: DimensionDelta;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[color:var(--topo-line)] py-2 last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topo-muted)]">
        {label}
      </span>
      <span className="font-mono text-xs tabular-nums text-[color:var(--topo-ink)]">
        {dim.before.pct ?? "n/a"}% → {dim.after.pct ?? "n/a"}%
        <span className="ml-2 text-[color:var(--topo-muted)]">
          ({formatDelta(dim.pctDelta)} pts)
        </span>
      </span>
    </div>
  );
}

export function ReleaseCompare({
  releases,
  initialBeforeId,
  initialAfterId,
}: {
  releases: ReleaseOption[];
  initialBeforeId: string | null;
  initialAfterId: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [beforeId, setBeforeId] = useState(
    initialBeforeId ?? releases[1]?.id ?? "",
  );
  const [afterId, setAfterId] = useState(
    initialAfterId ?? releases[0]?.id ?? "",
  );
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runCompare(before: string, after: string) {
    if (!before || !after || before === after) {
      setError("Select two different releases");
      setComparison(null);
      return;
    }
    setError(null);
    const res = await fetch("/api/releases/compare", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        beforeReleaseId: before,
        afterReleaseId: after,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(
        typeof data.error === "string" ? data.error : "Compare failed",
      );
      setComparison(null);
      return;
    }
    setComparison(data.comparison as Comparison);
    startTransition(() => {
      router.replace(
        `/releases/compare?before=${before}&after=${after}`,
        { scroll: false },
      );
    });
  }

  useEffect(() => {
    if (beforeId && afterId && beforeId !== afterId) {
      void runCompare(beforeId, afterId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only when ids set
  }, []);

  const beforeName = releases.find((r) => r.id === beforeId)?.name ?? "—";
  const afterName = releases.find((r) => r.id === afterId)?.name ?? "—";

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Release"
        title="Compare"
        description="Numeric deltas of coverage, flake, and unverified changes between two frozen snapshots."
        actions={
          <Link
            href="/releases"
            className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] px-3 py-1.5 text-xs font-medium text-[color:var(--topo-ink)]"
          >
            All releases
          </Link>
        }
      />

      {releases.length < 2 ? (
        <p className="rounded-md border border-dashed border-[color:var(--topo-line)] px-4 py-8 text-sm text-[color:var(--topo-muted)]">
          Need at least two releases with snapshots to compare.{" "}
          <Link href="/releases" className="text-[color:var(--topo-accent)]">
            Create a release
          </Link>
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
            <label className="flex flex-col gap-1 text-xs text-[color:var(--topo-muted)]">
              Before
              <select
                className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
                value={beforeId}
                onChange={(e) => setBeforeId(e.target.value)}
              >
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-[color:var(--topo-muted)]">
              After
              <select
                className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-surface)] px-2 py-1.5 text-sm text-[color:var(--topo-ink)]"
                value={afterId}
                onChange={(e) => setAfterId(e.target.value)}
              >
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
            <Button
              isDisabled={pending}
              onPress={() => void runCompare(beforeId, afterId)}
            >
              Compare
            </Button>
          </div>

          {error ? (
            <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
              {error}
            </p>
          ) : null}

          {comparison ? (
            <section className="rounded-md border border-[color:var(--topo-line)] bg-[color:var(--topo-panel)] p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <StatusChip mono>{beforeName}</StatusChip>
                <span className="text-xs text-[color:var(--topo-muted)]">→</span>
                <StatusChip mono>{afterName}</StatusChip>
              </div>
              <DimCompare label="Requirements" dim={comparison.requirement} />
              <DimCompare label="Risks" dim={comparison.risk} />
              <DimCompare label="Automation" dim={comparison.automation} />
              <DimCompare label="Execution" dim={comparison.execution} />
              <div className="flex justify-between border-b border-[color:var(--topo-line)] py-2 font-mono text-xs">
                <span className="text-[color:var(--topo-muted)]">Flake</span>
                <span>
                  {comparison.flakeCount.before} → {comparison.flakeCount.after}{" "}
                  ({formatDelta(comparison.flakeCount.delta)})
                </span>
              </div>
              <div className="flex justify-between py-2 font-mono text-xs">
                <span className="text-[color:var(--topo-muted)]">
                  Unverified
                </span>
                <span>
                  {comparison.unverifiedChanges.before} →{" "}
                  {comparison.unverifiedChanges.after} (
                  {formatDelta(comparison.unverifiedChanges.delta)})
                </span>
              </div>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
