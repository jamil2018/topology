import { and, count, desc, eq, inArray, isNotNull } from "drizzle-orm";
import {
  computeReleaseQuality,
  type CoverageGap,
  type CoverageDimension,
  type ReleaseQualityGap,
  type ReleaseQualityInput,
  type ReleaseQualitySummary,
  type ReleaseSnapshot,
  type ReleaseComparison,
  compareReleases,
} from "@topology/domain";
import { db } from "@/db";
import {
  cases,
  components,
  releaseSnapshots,
  releases,
  runResults,
  runs,
  testIntents,
} from "@/db/schema";
import { getWorkspaceCoverage } from "@/lib/quality-graph";
import { countFlakeSuspects } from "@/lib/queries";

const GAP_REASONS: Record<string, string> = {
  uncovered_requirement: "no linked test intent",
  manual_only_p0: "P0 intent lacks automation",
  never_executed: "never executed in workspace",
};

/** Map coverage gaps into release-quality gap rows (with inspectable reasons). */
export function mapCoverageGapsToReleaseGaps(
  gaps: Array<CoverageGap | ReleaseQualityGap>,
): ReleaseQualityGap[] {
  return gaps.map((g) => ({
    kind: g.kind,
    id: g.id,
    key: g.key,
    title: g.title,
    reason:
      "reason" in g && g.reason
        ? g.reason
        : (GAP_REASONS[g.kind] ?? undefined),
  }));
}

/**
 * Collapse per-result rows into intent outcomes (failed wins over passed).
 * Ignores statuses other than passed/failed.
 */
export function tallyIntentOutcomes(
  rows: Array<{ intentId: string; status: string }>,
): { passed: number; failed: number; executed: number } {
  const byIntent = new Map<string, "passed" | "failed">();
  for (const row of rows) {
    if (!row.intentId) continue;
    if (row.status === "failed") {
      byIntent.set(row.intentId, "failed");
      continue;
    }
    if (row.status === "passed" && byIntent.get(row.intentId) !== "failed") {
      byIntent.set(row.intentId, "passed");
    }
  }
  let passed = 0;
  let failed = 0;
  for (const status of byIntent.values()) {
    if (status === "passed") passed += 1;
    else failed += 1;
  }
  return { passed, failed, executed: passed + failed };
}

/** Build ReleaseQualityInput from graph counts + latest-run tallies + gaps. */
export function buildReleaseQualityInputFromParts(parts: {
  componentCount: number;
  requirementTotal: number;
  intentTotal: number;
  passed: number;
  failed: number;
  gaps: Array<CoverageGap | ReleaseQualityGap>;
}): ReleaseQualityInput {
  const passed = Math.max(0, parts.passed);
  const failed = Math.max(0, parts.failed);
  const executed = passed + failed;
  const intentTotal = Math.max(0, parts.intentTotal);
  return {
    affectedComponents: Math.max(0, parts.componentCount),
    affectedRequirements: Math.max(0, parts.requirementTotal),
    affectedIntents: intentTotal,
    executed,
    passed,
    failed,
    notExecuted: Math.max(0, intentTotal - executed),
    gaps: mapCoverageGapsToReleaseGaps(parts.gaps),
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isGapRow(value: unknown): value is ReleaseQualityGap {
  if (!value || typeof value !== "object") return false;
  const g = value as Record<string, unknown>;
  return (
    typeof g.kind === "string" &&
    typeof g.id === "string" &&
    typeof g.key === "string" &&
    typeof g.title === "string" &&
    (g.reason === undefined || typeof g.reason === "string")
  );
}

/** True when body looks like a full precomputed {@link ReleaseQualityInput}. */
export function isReleaseQualityInput(
  body: unknown,
): body is ReleaseQualityInput {
  if (!body || typeof body !== "object") return false;
  const o = body as Record<string, unknown>;
  return (
    isFiniteNumber(o.affectedComponents) &&
    isFiniteNumber(o.affectedRequirements) &&
    isFiniteNumber(o.affectedIntents) &&
    isFiniteNumber(o.executed) &&
    isFiniteNumber(o.passed) &&
    isFiniteNumber(o.failed) &&
    isFiniteNumber(o.notExecuted) &&
    Array.isArray(o.gaps) &&
    o.gaps.every(isGapRow)
  );
}

/**
 * Empty object, nullish, or `{ mode: "workspace" }` → load from workspace.
 * Anything else that is not a full ReleaseQualityInput is invalid.
 */
export function parseAnalyzeBody(
  body: unknown,
):
  | { ok: true; mode: "workspace" }
  | { ok: true; mode: "precomputed"; input: ReleaseQualityInput }
  | { ok: false; error: string } {
  if (body == null) return { ok: true, mode: "workspace" };
  if (typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const o = body as Record<string, unknown>;
  const keys = Object.keys(o).filter((k) => o[k] !== undefined);
  if (keys.length === 0 || o.mode === "workspace") {
    return { ok: true, mode: "workspace" };
  }
  if (isReleaseQualityInput(body)) {
    return { ok: true, mode: "precomputed", input: body };
  }
  return {
    ok: false,
    error:
      "Body must be empty/{ mode: \"workspace\" } or a full ReleaseQualityInput",
  };
}

function isCoverageDimension(value: unknown): value is CoverageDimension {
  if (!value || typeof value !== "object") return false;
  const d = value as Record<string, unknown>;
  return (
    isFiniteNumber(d.covered) &&
    isFiniteNumber(d.total) &&
    (d.pct === null || isFiniteNumber(d.pct))
  );
}

export function isReleaseSnapshot(value: unknown): value is ReleaseSnapshot {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    isCoverageDimension(s.requirement) &&
    isCoverageDimension(s.risk) &&
    isCoverageDimension(s.automation) &&
    isCoverageDimension(s.execution) &&
    isFiniteNumber(s.flakeCount) &&
    isFiniteNumber(s.unverifiedChanges)
  );
}

export function parseCompareBody(
  body: unknown,
):
  | { ok: true; mode: "snapshots"; before: ReleaseSnapshot; after: ReleaseSnapshot }
  | {
      ok: true;
      mode: "releaseIds";
      beforeReleaseId: string;
      afterReleaseId: string;
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Body must be a JSON object" };
  }
  const o = body as Record<string, unknown>;

  const beforeId =
    typeof o.beforeReleaseId === "string" ? o.beforeReleaseId : null;
  const afterId =
    typeof o.afterReleaseId === "string" ? o.afterReleaseId : null;
  if (beforeId || afterId) {
    if (!beforeId || !afterId) {
      return {
        ok: false,
        error: "Body requires beforeReleaseId and afterReleaseId",
      };
    }
    return {
      ok: true,
      mode: "releaseIds",
      beforeReleaseId: beforeId,
      afterReleaseId: afterId,
    };
  }

  if (!isReleaseSnapshot(o.before) || !isReleaseSnapshot(o.after)) {
    return {
      ok: false,
      error:
        "Body requires before/after ReleaseSnapshot objects or beforeReleaseId/afterReleaseId",
    };
  }
  return { ok: true, mode: "snapshots", before: o.before, after: o.after };
}

/**
 * Freeze current workspace coverage + flake/unverified into a ReleaseSnapshot.
 */
export async function buildWorkspaceReleaseSnapshot(
  workspaceId: string,
): Promise<ReleaseSnapshot> {
  const [coverage, flakeCount] = await Promise.all([
    getWorkspaceCoverage(workspaceId),
    countFlakeSuspects(workspaceId),
  ]);
  return {
    requirement: coverage.requirement,
    risk: coverage.risk,
    automation: coverage.automation,
    execution: coverage.execution,
    flakeCount,
    unverifiedChanges: coverage.freshnessSummary.unverified,
  };
}

export function parseStoredSnapshot(
  payloadJson: string,
): ReleaseSnapshot | null {
  try {
    const parsed = JSON.parse(payloadJson) as unknown;
    return isReleaseSnapshot(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function loadReleaseSnapshotPayload(
  workspaceId: string,
  releaseId: string,
): Promise<
  | { ok: true; snapshot: ReleaseSnapshot; release: typeof releases.$inferSelect }
  | { ok: false; error: string }
> {
  const release = await db.query.releases.findFirst({
    where: and(
      eq(releases.id, releaseId),
      eq(releases.workspaceId, workspaceId),
    ),
  });
  if (!release) {
    return { ok: false, error: `Release not found: ${releaseId}` };
  }
  const row = await db.query.releaseSnapshots.findFirst({
    where: eq(releaseSnapshots.releaseId, releaseId),
    orderBy: [desc(releaseSnapshots.createdAt)],
  });
  if (!row) {
    return { ok: false, error: `No snapshot for release: ${release.name}` };
  }
  const snapshot = parseStoredSnapshot(row.payloadJson);
  if (!snapshot) {
    return { ok: false, error: `Invalid snapshot for release: ${release.name}` };
  }
  return { ok: true, snapshot, release };
}

async function latestRunIntentTallies(workspaceId: string): Promise<{
  runId: string | null;
  passed: number;
  failed: number;
  executed: number;
}> {
  const latest =
    (await db.query.runs.findFirst({
      where: and(
        eq(runs.workspaceId, workspaceId),
        eq(runs.status, "completed"),
      ),
      orderBy: [desc(runs.completedAt), desc(runs.updatedAt)],
    })) ??
    (await db.query.runs.findFirst({
      where: eq(runs.workspaceId, workspaceId),
      orderBy: [desc(runs.updatedAt)],
    }));

  if (!latest) {
    return { runId: null, passed: 0, failed: 0, executed: 0 };
  }

  const rows = await db
    .select({
      intentId: cases.intentId,
      status: runResults.status,
    })
    .from(runResults)
    .innerJoin(cases, eq(runResults.caseId, cases.id))
    .where(
      and(
        eq(runResults.runId, latest.id),
        isNotNull(cases.intentId),
        inArray(runResults.status, ["passed", "failed"]),
      ),
    );

  const tallies = tallyIntentOutcomes(
    rows
      .filter((r) => Boolean(r.intentId))
      .map((r) => ({ intentId: r.intentId as string, status: r.status })),
  );

  return { runId: latest.id, ...tallies };
}

/**
 * Build release-quality input from workspace coverage + intents + latest run.
 * No release tables — scope is the whole workspace graph.
 */
export async function buildWorkspaceReleaseQualityInput(
  workspaceId: string,
): Promise<{
  input: ReleaseQualityInput;
  runId: string | null;
  coverage: Awaited<ReturnType<typeof getWorkspaceCoverage>>;
}> {
  const [coverage, componentRows, intentCountRow, tallies] = await Promise.all([
    getWorkspaceCoverage(workspaceId),
    db
      .select({ value: count() })
      .from(components)
      .where(eq(components.workspaceId, workspaceId)),
    db
      .select({ value: count() })
      .from(testIntents)
      .where(eq(testIntents.workspaceId, workspaceId)),
    latestRunIntentTallies(workspaceId),
  ]);

  const input = buildReleaseQualityInputFromParts({
    componentCount: Number(componentRows[0]?.value ?? 0),
    requirementTotal: coverage.requirement.total,
    intentTotal: Number(intentCountRow[0]?.value ?? coverage.execution.total),
    passed: tallies.passed,
    failed: tallies.failed,
    gaps: coverage.gaps,
  });

  return { input, runId: tallies.runId, coverage };
}

export async function analyzeReleaseQuality(
  workspaceId: string,
  body: unknown,
): Promise<
  | {
      ok: true;
      mode: "workspace" | "precomputed";
      quality: ReleaseQualitySummary;
      runId?: string | null;
    }
  | { ok: false; error: string }
> {
  const parsed = parseAnalyzeBody(body);
  if (!parsed.ok) return parsed;

  if (parsed.mode === "precomputed") {
    return {
      ok: true,
      mode: "precomputed",
      quality: computeReleaseQuality(parsed.input),
    };
  }

  const { input, runId } = await buildWorkspaceReleaseQualityInput(workspaceId);
  return {
    ok: true,
    mode: "workspace",
    quality: computeReleaseQuality(input),
    runId,
  };
}

export async function compareReleaseSnapshots(
  workspaceId: string,
  body: unknown,
): Promise<
  | {
      ok: true;
      comparison: ReleaseComparison;
      beforeReleaseId?: string;
      afterReleaseId?: string;
    }
  | { ok: false; error: string }
> {
  const parsed = parseCompareBody(body);
  if (!parsed.ok) return parsed;

  if (parsed.mode === "snapshots") {
    return {
      ok: true,
      comparison: compareReleases(parsed.before, parsed.after),
    };
  }

  const [before, after] = await Promise.all([
    loadReleaseSnapshotPayload(workspaceId, parsed.beforeReleaseId),
    loadReleaseSnapshotPayload(workspaceId, parsed.afterReleaseId),
  ]);
  if (!before.ok) return before;
  if (!after.ok) return after;

  return {
    ok: true,
    comparison: compareReleases(before.snapshot, after.snapshot),
    beforeReleaseId: parsed.beforeReleaseId,
    afterReleaseId: parsed.afterReleaseId,
  };
}
