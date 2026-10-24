import { eq } from "drizzle-orm";
import { computeImpact, type ImpactPathRule, type ImpactReport } from "@topology/domain";
import { db } from "@/db";
import {
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

  return {
    impact,
    pathRulesApplied: pathRules.length,
    unknownComponentKeys: unknownKeys,
    rulesSource,
  };
}


