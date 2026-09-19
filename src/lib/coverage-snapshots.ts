import { and, desc, eq } from "drizzle-orm";
import type { CoverageDimension, CoverageGap, CoverageReport } from "@topology/domain";
import { db } from "@/db";
import {
  coverageSnapshots,
  type CoverageSnapshot,
  type CoverageSnapshotSource,
} from "@/db/schema";
import { getWorkspaceCoverage } from "@/lib/quality-graph";
import { dispatchWebhook } from "@/lib/webhooks";

export const COVERAGE_DROP_EPSILON = 0.5;

export type StoredCoverageDimensions = {
  requirement: CoverageDimension;
  risk: CoverageDimension;
  automation: CoverageDimension;
  execution: CoverageDimension;
  freshnessSummary?: { fresh: number; unverified: number };
};

export type CoverageDimensionKey = keyof Pick<
  StoredCoverageDimensions,
  "requirement" | "risk" | "automation" | "execution"
>;

export const COVERAGE_DIMENSION_KEYS: CoverageDimensionKey[] = [
  "requirement",
  "risk",
  "automation",
  "execution",
];

export type DimensionDelta = {
  key: CoverageDimensionKey;
  beforePct: number | null;
  afterPct: number | null;
  delta: number | null;
  dropped: boolean;
};

export function dimensionsFromReport(
  report: CoverageReport & {
    freshnessSummary?: { fresh: number; unverified: number };
  },
): StoredCoverageDimensions {
  return {
    requirement: report.requirement,
    risk: report.risk,
    automation: report.automation,
    execution: report.execution,
    freshnessSummary: report.freshnessSummary,
  };
}

export function parseSnapshotDimensions(
  json: string,
): StoredCoverageDimensions | null {
  try {
    const parsed = JSON.parse(json) as StoredCoverageDimensions;
    if (!parsed || typeof parsed !== "object") return null;
    for (const key of COVERAGE_DIMENSION_KEYS) {
      const dim = parsed[key];
      if (!dim || typeof dim !== "object") return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function parseSnapshotGaps(json: string | null): CoverageGap[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as CoverageGap[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Compare coverage % between two stored dimension blobs. */
export function compareSnapshotDimensions(
  before: StoredCoverageDimensions,
  after: StoredCoverageDimensions,
  epsilon = COVERAGE_DROP_EPSILON,
): DimensionDelta[] {
  return COVERAGE_DIMENSION_KEYS.map((key) => {
    const beforePct = before[key].pct;
    const afterPct = after[key].pct;
    let delta: number | null = null;
    if (beforePct != null && afterPct != null) {
      delta = afterPct - beforePct;
    }
    const dropped =
      beforePct != null &&
      afterPct != null &&
      afterPct < beforePct - epsilon;
    return { key, beforePct, afterPct, delta, dropped };
  });
}

export function compareSnapshots(
  a: { dimensionsJson: string },
  b: { dimensionsJson: string },
  epsilon = COVERAGE_DROP_EPSILON,
): DimensionDelta[] | null {
  const before = parseSnapshotDimensions(a.dimensionsJson);
  const after = parseSnapshotDimensions(b.dimensionsJson);
  if (!before || !after) return null;
  return compareSnapshotDimensions(before, after, epsilon);
}

export function droppedDimensionDeltas(
  deltas: DimensionDelta[],
): DimensionDelta[] {
  return deltas.filter((d) => d.dropped);
}

export function serializeSnapshot(row: CoverageSnapshot) {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    capturedAt: row.capturedAt,
    label: row.label,
    source: row.source,
    releaseId: row.releaseId,
    dimensions: parseSnapshotDimensions(row.dimensionsJson),
    gaps: parseSnapshotGaps(row.gapsJson),
    createdAt: row.createdAt,
  };
}

export async function getSnapshot(
  workspaceId: string,
  snapshotId: string,
): Promise<CoverageSnapshot | null> {
  const row = await db.query.coverageSnapshots.findFirst({
    where: and(
      eq(coverageSnapshots.id, snapshotId),
      eq(coverageSnapshots.workspaceId, workspaceId),
    ),
  });
  return row ?? null;
}

export async function listSnapshots(
  workspaceId: string,
  limit = 50,
): Promise<CoverageSnapshot[]> {
  return db.query.coverageSnapshots.findMany({
    where: eq(coverageSnapshots.workspaceId, workspaceId),
    orderBy: [desc(coverageSnapshots.capturedAt)],
    limit,
  });
}

async function latestSnapshot(
  workspaceId: string,
): Promise<CoverageSnapshot | null> {
  const rows = await listSnapshots(workspaceId, 1);
  return rows[0] ?? null;
}

export type CaptureCoverageSnapshotOpts = {
  label?: string | null;
  source?: CoverageSnapshotSource;
  releaseId?: string | null;
  /** When false, skip coverage.dropped webhook (still stores snapshot). */
  dispatchWebhooks?: boolean;
};

export async function captureCoverageSnapshot(
  workspaceId: string,
  opts: CaptureCoverageSnapshotOpts = {},
) {
  const coverage = await getWorkspaceCoverage(workspaceId);
  const dimensions = dimensionsFromReport(coverage);
  const previous = await latestSnapshot(workspaceId);

  const [row] = await db
    .insert(coverageSnapshots)
    .values({
      workspaceId,
      label: opts.label?.trim() || null,
      source: opts.source ?? "manual",
      dimensionsJson: JSON.stringify(dimensions),
      gapsJson: JSON.stringify(coverage.gaps),
      releaseId: opts.releaseId ?? null,
    })
    .returning();

  if (
    opts.dispatchWebhooks !== false &&
    previous &&
    previous.id !== row.id
  ) {
    const deltas = compareSnapshots(previous, row);
    if (deltas) {
      const dropped = droppedDimensionDeltas(deltas);
      if (dropped.length > 0) {
        void dispatchWebhook(
          "coverage.dropped",
          {
            previousSnapshotId: previous.id,
            snapshotId: row.id,
            capturedAt: row.capturedAt.toISOString(),
            dimensions: dropped.map((d) => ({
              key: d.key,
              beforePct: d.beforePct,
              afterPct: d.afterPct,
              delta: d.delta,
            })),
          },
          workspaceId,
        ).catch(() => {});
      }
    }
  }

  return serializeSnapshot(row);
}
