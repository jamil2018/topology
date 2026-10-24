import {
  countResultStatuses,
  RESULT_STATUSES,
  type StatusCounts,
} from "./run-executor-model";
import { statusBarClass } from "./run-status-styles";

function emptyCounts(): StatusCounts {
  return {
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    untested: 0,
  };
}

export function RunProgressBar({
  results,
  passed,
  failed,
  skipped,
  blocked,
  untested,
  total,
  className = "",
}: {
  results?: { status: string }[];
  passed?: number;
  failed?: number;
  skipped?: number;
  blocked?: number;
  untested?: number;
  total?: number;
  className?: string;
}) {
  const counts = results
    ? countResultStatuses(results)
    : {
        ...emptyCounts(),
        passed: passed ?? 0,
        failed: failed ?? 0,
        skipped: skipped ?? 0,
        blocked: blocked ?? 0,
        untested: untested ?? 0,
      };
  const resolvedTotal =
    results?.length ??
    total ??
    counts.passed +
      counts.failed +
      counts.skipped +
      counts.blocked +
      counts.untested;
  const done =
    counts.passed + counts.failed + counts.skipped + counts.blocked;
  const pct =
    resolvedTotal === 0 ? 0 : Math.round((done / resolvedTotal) * 100);
  const showLabel = Boolean(results);

  return (
    <div className={showLabel ? `space-y-1.5 ${className}` : className}>
      {showLabel ? (
        <div className="flex justify-between font-mono text-[10px] uppercase tracking-wide text-[color:var(--topo-muted)]">
          <span>
            Progress {done}/{resolvedTotal}
          </span>
          <span>{pct}%</span>
        </div>
      ) : null}
      <div
        className="flex h-1.5 overflow-hidden rounded-sm bg-[color:var(--topo-surface)]"
        role={showLabel ? "meter" : "progressbar"}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={showLabel ? "Run progress" : `Run progress ${pct}%`}
      >
        {RESULT_STATUSES.filter((status) => status !== "untested").map(
          (status) => {
            const value = counts[status];
            if (!value || resolvedTotal === 0) return null;
            return (
              <div
                key={status}
                className={`h-full ${statusBarClass(status)}`}
                style={{ width: `${(value / resolvedTotal) * 100}%` }}
              />
            );
          },
        )}
      </div>
    </div>
  );
}
