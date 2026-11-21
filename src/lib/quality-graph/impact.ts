import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { computeImpact, type ImpactPathRule, type ImpactReport } from "@topology/domain";
import { db } from "@/db";
import {
  cases,
  components,
  pathComponentRules,
  qualityEdges,
  requirements,
  testImplementations,
  testIntents,
} from "@/db/schema";
import {
  mapDbPathRules,
  mapPathRulesByComponentKey,
} from "@/lib/impact-path-rules";
import { collectCaseIdsForIntents } from "@/lib/resolve-impact-cases";

/**
 * Resolve catalog case IDs linked to the given intent IDs (via case.intentId
 * or implementation.caseId).
 */
export async function resolveCaseIdsForIntents(
  workspaceId: string,
  intentIds: readonly string[],
): Promise<string[]> {
  const uniqueIntentIds = [...new Set(intentIds.filter(Boolean))];
  if (uniqueIntentIds.length === 0) return [];

  const [caseRows, implRows] = await Promise.all([
    db
      .select({ id: cases.id, intentId: cases.intentId })
      .from(cases)
      .where(
        and(
          eq(cases.workspaceId, workspaceId),
          inArray(cases.intentId, uniqueIntentIds),
        ),
      ),
    db
      .select({
        intentId: testImplementations.intentId,
        caseId: testImplementations.caseId,
      })
      .from(testImplementations)
      .where(
        and(
          eq(testImplementations.workspaceId, workspaceId),
          inArray(testImplementations.intentId, uniqueIntentIds),
          isNotNull(testImplementations.caseId),
        ),
      ),
  ]);

  return collectCaseIdsForIntents({
    intentIds: uniqueIntentIds,
    cases: caseRows,
    implementations: implRows,
  });
}

/**
 * Load workspace graph entities and walk change impact for the given paths.
 * When `rules` is omitted, path_component_rules are loaded from the DB.
 */
export async function getWorkspaceImpact(
  workspaceId: string,
  changedPaths: string[],
  rules?: { pattern: string; componentKey: string }[],
): Promise<{
  impact: ImpactReport;
  caseIds: string[];
  pathRulesApplied: number;
  unknownComponentKeys: string[];
  rulesSource: "request" | "database";
}> {
  const [componentRows, reqRows, intentRows, implRows, edgeRows, dbRuleRows] =
    await Promise.all([
      db.query.components.findMany({
        where: eq(components.workspaceId, workspaceId),
      }),
      db.query.requirements.findMany({
        where: eq(requirements.workspaceId, workspaceId),
      }),
      db.query.testIntents.findMany({
        where: eq(testIntents.workspaceId, workspaceId),
      }),
      db.query.testImplementations.findMany({
        where: eq(testImplementations.workspaceId, workspaceId),
      }),
      db.query.qualityEdges.findMany({
        where: eq(qualityEdges.workspaceId, workspaceId),
      }),
      rules === undefined
        ? db.query.pathComponentRules.findMany({
            where: eq(pathComponentRules.workspaceId, workspaceId),
          })
        : Promise.resolve([]),
    ]);

  let pathRules: ImpactPathRule[];
  let unknownKeys: string[] = [];
  let rulesSource: "request" | "database";

  if (rules === undefined) {
    pathRules = mapDbPathRules(dbRuleRows);
    rulesSource = "database";
  } else {
    const mapped = mapPathRulesByComponentKey(rules, componentRows);
    pathRules = mapped.pathRules;
    unknownKeys = mapped.unknownKeys;
    rulesSource = "request";
  }

  const impact = computeImpact({
    changedPaths,
    pathRules,
    components: componentRows.map((c) => ({
      id: c.id,
      key: c.key,
      title: c.title,
    })),
    requirements: reqRows.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
    })),
    intents: intentRows.map((i) => ({
      id: i.id,
      key: i.key,
      title: i.title,
      criticality: i.criticality,
    })),
    implementations: implRows.map((i) => ({
      id: i.id,
      intentId: i.intentId,
      type: i.type,
      sourcePath: i.sourcePath,
    })),
    edges: edgeRows.map((e) => ({
      fromType: e.fromType,
      fromId: e.fromId,
      toType: e.toType,
      toId: e.toId,
      relation: e.relation,
    })),
  });

  const caseIds = await resolveCaseIdsForIntents(
    workspaceId,
    impact.intents.map((i) => i.id),
  );

  return {
    impact,
    caseIds,
    pathRulesApplied: pathRules.length,
    unknownComponentKeys: unknownKeys,
    rulesSource,
  };
}


