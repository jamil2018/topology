import { and, asc, eq, isNotNull, ne, sql } from "drizzle-orm";
import {
  computeCoverage,
  computeFreshness,
  type CoverageGap,
  type CoverageReport,
} from "@topology/domain";
import { db } from "@/db";
import {
  cases,
  journeys,
  qualityEdges,
  requirements,
  risks,
  runResults,
  runs,
  testImplementations,
  testIntents,
} from "@/db/schema";

/** Narrow coverage gaps by kind, key, or title substring (case-insensitive). */
export function filterCoverageReport<
  T extends CoverageReport & { freshnessSummary?: unknown },
>(report: T, filter?: string | null): T {
  const q = filter?.trim().toLowerCase();
  if (!q) return report;
  const gaps = report.gaps.filter(
    (g: CoverageGap) =>
      g.kind.toLowerCase().includes(q) ||
      g.key.toLowerCase().includes(q) ||
      g.title.toLowerCase().includes(q),
  );
  return { ...report, gaps };
}

/** Load graph inputs and compute coverage for a workspace. */
export async function getWorkspaceCoverage(
  workspaceId: string,
): Promise<CoverageReport & { freshnessSummary: { fresh: number; unverified: number } }> {
  const [intentRows, implRows, reqRows, riskRows, edgeRows, lastExecRows] =
    await Promise.all([
      db.query.testIntents.findMany({
        where: eq(testIntents.workspaceId, workspaceId),
      }),
      db.query.testImplementations.findMany({
        where: eq(testImplementations.workspaceId, workspaceId),
      }),
      db.query.requirements.findMany({
        where: eq(requirements.workspaceId, workspaceId),
      }),
      db.query.risks.findMany({
        where: eq(risks.workspaceId, workspaceId),
      }),
      db.query.qualityEdges.findMany({
        where: eq(qualityEdges.workspaceId, workspaceId),
      }),
      db
        .select({
          intentId: cases.intentId,
          lastExecutedAt: sql<Date | null>`max(${runResults.executedAt})`,
        })
        .from(runResults)
        .innerJoin(cases, eq(runResults.caseId, cases.id))
        .innerJoin(runs, eq(runResults.runId, runs.id))
        .where(
          and(
            eq(runs.workspaceId, workspaceId),
            isNotNull(cases.intentId),
            ne(runResults.status, "untested"),
            isNotNull(runResults.executedAt),
          ),
        )
        .groupBy(cases.intentId),
    ]);

  const lastByIntent = new Map(
    lastExecRows
      .filter((r) => r.intentId)
      .map((r) => [r.intentId!, r.lastExecutedAt]),
  );

  const implsByIntent = new Map<string, { type: string }[]>();
  for (const impl of implRows) {
    const list = implsByIntent.get(impl.intentId) ?? [];
    list.push({ type: impl.type });
    implsByIntent.set(impl.intentId, list);
  }

  const intents = intentRows.map((intent) => ({
    id: intent.id,
    key: intent.key,
    title: intent.title,
    criticality: intent.criticality,
    implementations: implsByIntent.get(intent.id) ?? [],
    lastExecutedAt: lastByIntent.get(intent.id) ?? null,
  }));

  const report = computeCoverage({
    requirements: reqRows.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
    })),
    risks: riskRows.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      criticality: r.criticality,
    })),
    intents,
    edges: edgeRows.map((e) => ({
      fromType: e.fromType,
      fromId: e.fromId,
      toType: e.toType,
      toId: e.toId,
      relation: e.relation,
    })),
  });

  let fresh = 0;
  let unverified = 0;
  for (const intent of intents) {
    if (computeFreshness(intent.lastExecutedAt) === "fresh") fresh += 1;
    else unverified += 1;
  }

  return { ...report, freshnessSummary: { fresh, unverified } };
}

/** Journey is covered when linked to ≥1 intent via `covers` or `part_of`. */
export function computeJourneyCoverageDimension(
  journeyIds: string[],
  edges: Array<{
    fromType: string;
    fromId: string;
    toType: string;
    toId: string;
    relation: string;
  }>,
  intentIdSet: Set<string>,
): { covered: number; total: number; pct: number | null } {
  const total = journeyIds.length;
  if (total === 0) {
    return { covered: 0, total: 0, pct: null };
  }

  let covered = 0;
  for (const journeyId of journeyIds) {
    const linked = edges.some((e) => {
      if (e.relation !== "covers" && e.relation !== "part_of") return false;
      if (
        e.fromType === "journey" &&
        e.fromId === journeyId &&
        e.toType === "intent"
      ) {
        return intentIdSet.has(e.toId);
      }
      if (
        e.toType === "journey" &&
        e.toId === journeyId &&
        e.fromType === "intent"
      ) {
        return intentIdSet.has(e.fromId);
      }
      return false;
    });
    if (linked) covered += 1;
  }

  return {
    covered,
    total,
    pct: Math.round((covered / total) * 100),
  };
}

/** Load journeys + edges and compute journey coverage for Hub. */
export async function getJourneyCoverage(workspaceId: string): Promise<{
  journey: { covered: number; total: number; pct: number | null };
  journeys: Array<{
    id: string;
    key: string;
    title: string;
    criticality: string;
    intentIds: string[];
  }>;
}> {
  const [journeyRows, edgeRows, intentRows] = await Promise.all([
    db.query.journeys.findMany({
      where: eq(journeys.workspaceId, workspaceId),
      orderBy: [asc(journeys.key)],
    }),
    db.query.qualityEdges.findMany({
      where: eq(qualityEdges.workspaceId, workspaceId),
    }),
    db.query.testIntents.findMany({
      where: eq(testIntents.workspaceId, workspaceId),
      columns: { id: true },
    }),
  ]);

  const intentIdSet = new Set(intentRows.map((i) => i.id));
  const edges = edgeRows.map((e) => ({
    fromType: e.fromType,
    fromId: e.fromId,
    toType: e.toType,
    toId: e.toId,
    relation: e.relation,
  }));

  const journeysWithIntents = journeyRows.map((j) => {
    const intentIds: string[] = [];
    for (const e of edges) {
      if (e.relation !== "covers" && e.relation !== "part_of") continue;
      if (
        e.fromType === "journey" &&
        e.fromId === j.id &&
        e.toType === "intent" &&
        intentIdSet.has(e.toId)
      ) {
        intentIds.push(e.toId);
      } else if (
        e.toType === "journey" &&
        e.toId === j.id &&
        e.fromType === "intent" &&
        intentIdSet.has(e.fromId)
      ) {
        intentIds.push(e.fromId);
      }
    }
    return {
      id: j.id,
      key: j.key,
      title: j.title,
      criticality: j.criticality,
      intentIds: [...new Set(intentIds)],
    };
  });

  return {
    journey: computeJourneyCoverageDimension(
      journeyRows.map((j) => j.id),
      edges,
      intentIdSet,
    ),
    journeys: journeysWithIntents,
  };
}

