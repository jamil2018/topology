import { and, eq, gte, inArray, or, sql } from "drizzle-orm";
import { detectFlakeSignal } from "@topology/domain";
import { db } from "@/db";
import {
  implementationStats,
  runResults,
  testImplementations,
  type RunResult,
} from "@/db/schema";

type ResultStatus = RunResult["status"];

/** Default rolling windows refreshed on every completed run. */
export const DEFAULT_STAT_WINDOWS_DAYS = [7, 30] as const;

export type RollupHistoryPoint = {
  status: ResultStatus | string;
  at: Date | string;
  durationMs?: number | null;
};

export type ImplementationRollup = {
  /** Pass rate 0–100 from passed/(passed+failed), or null when no decisive samples. */
  passRate: number | null;
  /** Flake probability 0–1 derived from detectFlakeSignal score. */
  flakeProbability: number | null;
  durationP50: number | null;
  durationP95: number | null;
  lastRunAt: Date | null;
  lastStatus: ResultStatus | null;
};

type StatsDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  select: any;
};

function isResultStatus(value: string): value is ResultStatus {
  return (
    value === "passed" ||
    value === "failed" ||
    value === "blocked" ||
    value === "skipped" ||
    value === "untested"
  );
}

/**
 * Nearest-rank percentile on a pre-sorted ascending numeric array.
 * `p` is in 0–100. Returns null for empty input.
 */
export function percentile(sortedAscending: number[], p: number): number | null {
  if (sortedAscending.length === 0) return null;
  if (sortedAscending.length === 1) return sortedAscending[0]!;
  const clamped = Math.min(100, Math.max(0, p));
  const rank = Math.ceil((clamped / 100) * sortedAscending.length) - 1;
  const index = Math.min(sortedAscending.length - 1, Math.max(0, rank));
  return sortedAscending[index]!;
}

/**
 * Pure rollup math for a single implementation's history window.
 */
export function computeImplementationRollup(
  history: RollupHistoryPoint[],
): ImplementationRollup {
  const chronological = [...history].sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime(),
  );

  let passCount = 0;
  let failCount = 0;
  const durations: number[] = [];

  for (const point of chronological) {
    if (point.status === "passed") passCount += 1;
    else if (point.status === "failed") failCount += 1;

    if (
      point.durationMs != null &&
      Number.isFinite(point.durationMs) &&
      point.durationMs >= 0
    ) {
      durations.push(Math.trunc(point.durationMs));
    }
  }

  const decisive = passCount + failCount;
  const passRate =
    decisive === 0
      ? null
      : Math.round((passCount / decisive) * 1000) / 10;

  const flake = detectFlakeSignal(
    chronological.map((h) => ({
      status: isResultStatus(h.status) ? h.status : "untested",
      at: h.at,
    })),
  );
  const flakeProbability =
    chronological.length === 0 ? null : Math.round(flake.score) / 100;

  durations.sort((a, b) => a - b);

  const last = chronological[chronological.length - 1];
  const lastStatus =
    last && isResultStatus(last.status) ? last.status : null;

  return {
    passRate,
    flakeProbability,
    durationP50: percentile(durations, 50),
    durationP95: percentile(durations, 95),
    lastRunAt: last ? new Date(last.at) : null,
    lastStatus,
  };
}

async function resolveImplementationIdsForRun(
  executor: StatsDb,
  runId: string,
): Promise<string[]> {
  const results = await executor.query.runResults.findMany({
    where: eq(runResults.runId, runId),
    columns: {
      implementationId: true,
      caseId: true,
    },
  });

  const ids = new Set<string>();
  const caseIds: string[] = [];

  for (const row of results as {
    implementationId: string | null;
    caseId: string | null;
  }[]) {
    if (row.implementationId) ids.add(row.implementationId);
    else if (row.caseId) caseIds.push(row.caseId);
  }

  if (caseIds.length > 0) {
    const uniqueCaseIds = [...new Set(caseIds)];
    const impls = await executor.query.testImplementations.findMany({
      where: inArray(testImplementations.caseId, uniqueCaseIds),
      columns: { id: true },
    });
    for (const impl of impls as { id: string }[]) {
      ids.add(impl.id);
    }
  }

  return [...ids];
}

async function loadHistoryForImplementation(
  executor: StatsDb,
  implementationId: string,
  since: Date,
): Promise<RollupHistoryPoint[]> {
  const impl = await executor.query.testImplementations.findFirst({
    where: eq(testImplementations.id, implementationId),
    columns: { caseId: true },
  });

  const identityFilter = impl?.caseId
    ? or(
        eq(runResults.implementationId, implementationId),
        and(
          eq(runResults.caseId, impl.caseId),
          sql`${runResults.implementationId} is null`,
        ),
      )
    : eq(runResults.implementationId, implementationId);

  const rows = (await executor
    .select({
      id: runResults.id,
      status: runResults.status,
      at: sql<Date>`coalesce(${runResults.executedAt}, ${runResults.createdAt})`,
      durationMs: runResults.durationMs,
    })
    .from(runResults)
    .where(
      and(
        identityFilter,
        gte(
          sql`coalesce(${runResults.executedAt}, ${runResults.createdAt})`,
          since,
        ),
      ),
    )) as {
    id: string;
    status: string;
    at: Date;
    durationMs: number | null;
  }[];

  return rows.map((row) => ({
    status: row.status,
    at: row.at,
    durationMs: row.durationMs,
  }));
}

async function upsertRollupRow(
  executor: StatsDb,
  implementationId: string,
  windowDays: number,
  rollup: ImplementationRollup,
) {
  const existing = await executor.query.implementationStats.findFirst({
    where: and(
      eq(implementationStats.implementationId, implementationId),
      eq(implementationStats.windowDays, windowDays),
    ),
  });

  const values = {
    passRate: rollup.passRate,
    flakeProbability: rollup.flakeProbability,
    durationP50: rollup.durationP50,
    durationP95: rollup.durationP95,
    lastRunAt: rollup.lastRunAt,
    lastStatus: rollup.lastStatus,
    updatedAt: new Date(),
  };

  if (existing) {
    await executor
      .update(implementationStats)
      .set(values)
      .where(eq(implementationStats.id, existing.id));
    return;
  }

  await executor.insert(implementationStats).values({
    implementationId,
    windowDays,
    ...values,
  });
}

/**
 * Recompute and upsert implementation_stats for every implementation touched
 * by a completed run (default 7- and 30-day windows).
 */
export async function refreshImplementationStatsForRun(
  runId: string,
  executor: StatsDb = db,
  windows: readonly number[] = DEFAULT_STAT_WINDOWS_DAYS,
): Promise<{ implementationIds: string[] }> {
  const implementationIds = await resolveImplementationIdsForRun(
    executor,
    runId,
  );
  if (implementationIds.length === 0) {
    return { implementationIds: [] };
  }

  const now = Date.now();

  for (const implementationId of implementationIds) {
    for (const windowDays of windows) {
      const since = new Date(now - windowDays * 24 * 60 * 60 * 1000);
      const history = await loadHistoryForImplementation(
        executor,
        implementationId,
        since,
      );
      const rollup = computeImplementationRollup(history);
      await upsertRollupRow(executor, implementationId, windowDays, rollup);
    }
  }

  return { implementationIds };
}
