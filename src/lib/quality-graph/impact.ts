import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { computeImpact, type ImpactPathRule, type ImpactReport } from "@topology/domain";
import { db } from "@/db";
import {
  cases,
  components,
  jiraRequirementSources,
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
import { intentForCoverageEdge, requirementForCoverageEdge } from "@/lib/project-requirements";
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
  rankedCases: Array<{
    id: string;
    key: string;
    title: string;
    priority: string;
    intentIds: string[];
    href: string;
  }>;
  suspectCoverageLinks: Array<{
    edgeId: string;
    requirementId: string;
    requirementKey: string;
    intentId: string;
    intentKey: string;
    jiraRevision: number;
    reviewedJiraRevision: number;
    href: string;
  }>;
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

  const impactedRequirements = new Map(impact.requirements.map((item) => [item.id, item]));
  const impactedIntents = new Map(impact.intents.map((item) => [item.id, item]));
  const [caseIds, jiraSources] = await Promise.all([
    resolveCaseIdsForIntents(workspaceId, [...impactedIntents.keys()]),
    impactedRequirements.size ? db.select({
      requirementId: jiraRequirementSources.requirementId, revision: jiraRequirementSources.revision,
    }).from(jiraRequirementSources).where(and(
      eq(jiraRequirementSources.workspaceId, workspaceId),
      inArray(jiraRequirementSources.requirementId, [...impactedRequirements.keys()]),
    )) : Promise.resolve([]),
  ]);
  const jiraRevisions = new Map(jiraSources.map((source) => [source.requirementId, source.revision]));
  const suspectCoverageLinks = edgeRows.flatMap((edge) => {
    const isRequirementCoverage = edge.relation === "covers" && (
      (edge.fromType === "requirement" && edge.toType === "intent") ||
      (edge.fromType === "intent" && edge.toType === "requirement")
    );
    if (!isRequirementCoverage) return [];
    const requirement = impactedRequirements.get(requirementForCoverageEdge(edge));
    const intent = impactedIntents.get(intentForCoverageEdge(edge));
    const revision = requirement ? jiraRevisions.get(requirement.id) : undefined;
    if (!requirement || !intent || revision === undefined || revision <= edge.reviewedJiraRevision) return [];
    return [{
      edgeId: edge.id, requirementId: requirement.id, requirementKey: requirement.key, intentId: intent.id,
      intentKey: intent.key, jiraRevision: revision, reviewedJiraRevision: edge.reviewedJiraRevision,
      href: `/requirements?requirement=${requirement.id}`,
    }];
  }).sort((a, b) => a.requirementKey.localeCompare(b.requirementKey) || a.intentKey.localeCompare(b.intentKey));

  const caseRows = caseIds.length ? await db.select({
    id: cases.id, key: cases.key, title: cases.title, priority: cases.priority, intentId: cases.intentId,
  }).from(cases).where(and(eq(cases.workspaceId, workspaceId), eq(cases.status, "ready"), inArray(cases.id, caseIds))) : [];
  const impactedIntentIds = impactedIntents;
  const caseIntents = new Map<string, string[]>();
  for (const implementation of implRows) {
    if (!implementation.caseId || !impactedIntentIds.has(implementation.intentId)) continue;
    const related = caseIntents.get(implementation.caseId) ?? [];
    related.push(implementation.intentId);
    caseIntents.set(implementation.caseId, related);
  }
  const rankedCases = caseRows.map(({ intentId, ...row }) => ({
    ...row,
    intentIds: [...new Set([
      ...(intentId && impactedIntentIds.has(intentId) ? [intentId] : []),
      ...(caseIntents.get(row.id) ?? []),
    ])].sort(),
    href: `/cases/${encodeURIComponent(row.key)}`,
  })).sort((a, b) => a.priority.localeCompare(b.priority) || a.key.localeCompare(b.key));

  return {
    impact,
    caseIds,
    rankedCases,
    suspectCoverageLinks,
    pathRulesApplied: pathRules.length,
    unknownComponentKeys: unknownKeys,
    rulesSource,
  };
}


