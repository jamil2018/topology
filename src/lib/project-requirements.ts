import { and, asc, eq, inArray, or } from "drizzle-orm";
import { db } from "@/db";
import { jiraRequirementSources, qualityEdges, requirements, testIntents } from "@/db/schema";
import { jiraRequirementSourceView } from "./jira-requirements";

export async function listProjectRequirements(workspaceId: string) {
  const [rows, edges] = await Promise.all([
    db.select({ requirement: requirements, source: jiraRequirementSources })
      .from(requirements)
      .leftJoin(jiraRequirementSources, and(
        eq(jiraRequirementSources.requirementId, requirements.id),
        eq(jiraRequirementSources.workspaceId, requirements.workspaceId),
      )).where(eq(requirements.workspaceId, workspaceId)).orderBy(asc(requirements.key)),
    db.query.qualityEdges.findMany({ where: and(
      eq(qualityEdges.workspaceId, workspaceId), eq(qualityEdges.relation, "covers"),
      or(
        and(eq(qualityEdges.fromType, "requirement"), eq(qualityEdges.toType, "intent")),
        and(eq(qualityEdges.toType, "requirement"), eq(qualityEdges.fromType, "intent")),
      ),
    ) }),
  ]);

  const intentIds = [...new Set(edges.map(intentForCoverageEdge))];
  const intents = intentIds.length ? await db.select({ id: testIntents.id, key: testIntents.key, title: testIntents.title })
    .from(testIntents).where(and(eq(testIntents.workspaceId, workspaceId), inArray(testIntents.id, intentIds))) : [];
  const intentsById = new Map(intents.map((intent) => [intent.id, intent]));
  const edgesByRequirement = new Map<string, typeof edges>();
  for (const edge of edges) {
    const id = requirementForCoverageEdge(edge);
    const group = edgesByRequirement.get(id);
    if (group) group.push(edge);
    else edgesByRequirement.set(id, [edge]);
  }

  return rows.map(({ requirement, source }) => {
    const requirementEdges = edgesByRequirement.get(requirement.id) ?? [];
    return {
      ...requirement,
      jira: source ? jiraRequirementSourceView(source) : null,
      coversIntentIds: requirementEdges.filter((edge) => edge.fromType === "requirement").map(intentForCoverageEdge),
      coverageLinks: requirementEdges.flatMap((edge) => {
        const intent = intentsById.get(intentForCoverageEdge(edge));
        return intent ? [{
          edgeId: edge.id, intent, reviewedJiraRevision: edge.reviewedJiraRevision,
          suspect: !!source && source.revision > edge.reviewedJiraRevision,
        }] : [];
      }).sort((a, b) => a.intent.key.localeCompare(b.intent.key) || a.edgeId.localeCompare(b.edgeId)),
    };
  });
}

type Edge = typeof qualityEdges.$inferSelect;

export function requirementForCoverageEdge(edge: Edge) {
  return edge.fromType === "requirement" ? edge.fromId : edge.toId;
}

export function intentForCoverageEdge(edge: Edge) {
  return edge.fromType === "intent" ? edge.fromId : edge.toId;
}
