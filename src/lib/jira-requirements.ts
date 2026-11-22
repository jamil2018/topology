import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, jiraRequirementRevisions, jiraRequirementSources, qualityEdges, requirements, workspaces } from "@/db/schema";
import type { JiraRequirementUpdate } from "./jira-requirement-webhook";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Target = { workspaceId: string; origin: string; projectId: string };
type HumanTarget = { workspaceId: string; requirementId: string; actorId: string };
type Source = typeof jiraRequirementSources.$inferSelect;

export function jiraRequirementSourceView(source: Pick<Source, "origin" | "issueId" | "issueKey" | "revision" | "remoteUpdatedAt">) {
  return {
    issueId: source.issueId, issueKey: source.issueKey, revision: source.revision,
    updatedAt: source.remoteUpdatedAt?.toISOString() ?? null,
    href: source.issueKey ? new URL(`/browse/${source.issueKey}`, source.origin).toString() : null,
  };
}

export async function lockRequirement(tx: Tx, workspaceId: string, id: string) {
  const [row] = await tx.select().from(requirements).where(and(
    eq(requirements.workspaceId, workspaceId), eq(requirements.id, id),
  )).for("update");
  return row ?? null;
}

export async function getJiraRequirementSource(tx: Pick<Tx, "query">, workspaceId: string, id: string) {
  return tx.query.jiraRequirementSources.findFirst({
    where: and(eq(jiraRequirementSources.workspaceId, workspaceId), eq(jiraRequirementSources.requirementId, id)),
  });
}

function audit(tx: Tx, input: {
  workspaceId: string; requirementId: string; action: string; actorId?: string; metadata: Record<string, unknown>;
}) {
  return tx.insert(auditEvents).values({
    workspaceId: input.workspaceId, actorId: input.actorId, targetType: "requirement", targetId: input.requirementId,
    action: input.action, metadataJson: JSON.stringify(input.metadata),
  });
}

export async function bindJiraRequirement(input: HumanTarget & { target: Target; issueId: string }) {
  return db.transaction(async (tx) => {
    const { workspaceId, requirementId, target, issueId } = input;
    if (!await lockRequirement(tx, workspaceId, requirementId)) return { status: "not_found" as const };
    const prior = await getJiraRequirementSource(tx, workspaceId, requirementId);
    if (prior) {
      if (prior.origin === target.origin && prior.projectId === target.projectId && prior.issueId === issueId) {
        return { status: "unchanged" as const, source: jiraRequirementSourceView(prior) };
      }
      return { status: "conflict" as const };
    }
    const [source] = await tx.insert(jiraRequirementSources).values({
      requirementId, workspaceId, origin: target.origin, projectId: target.projectId, issueId,
    }).onConflictDoNothing().returning();
    if (!source) return { status: "conflict" as const };
    await audit(tx, { ...input, action: "requirement.jira.bind", metadata: {
      origin: target.origin, projectId: target.projectId, issueId,
    } });
    return { status: "bound" as const, source: jiraRequirementSourceView(source) };
  });
}

export async function applyJiraRequirementUpdate(target: Target, event: JiraRequirementUpdate) {
  return db.transaction(async (tx) => {
    const mapped = await tx.query.jiraRequirementSources.findFirst({
      where: and(
        eq(jiraRequirementSources.workspaceId, target.workspaceId), eq(jiraRequirementSources.origin, target.origin),
        eq(jiraRequirementSources.projectId, target.projectId), eq(jiraRequirementSources.issueId, event.issueId),
      ),
      columns: { requirementId: true },
    });
    if (!mapped) return { status: "unmapped" as const };

    const { workspaceId } = target;
    const { requirementId } = mapped;
    const [active] = await tx.select({ id: workspaces.id }).from(workspaces)
      .where(and(eq(workspaces.id, workspaceId), isNull(workspaces.archivedAt))).for("share");
    if (!active) return { status: "ignored" as const };
    const requirement = await lockRequirement(tx, workspaceId, requirementId);
    const source = await getJiraRequirementSource(tx, workspaceId, requirementId);
    if (!requirement || !source) return { status: "unmapped" as const };
    const remoteTime = source.remoteUpdatedAt?.getTime();
    const eventTime = event.updatedAt.getTime();
    if (remoteTime !== undefined && remoteTime > eventTime) return { status: "stale" as const, revision: source.revision };
    const contentChanged = event.contentHash !== source.contentHash;
    if (remoteTime === eventTime) {
      return { status: contentChanged || event.issueKey !== source.issueKey ? "conflict" as const : "unchanged" as const, revision: source.revision };
    }

    const revision = contentChanged ? source.revision + 1 : source.revision;
    await tx.update(jiraRequirementSources).set({
      remoteUpdatedAt: event.updatedAt, issueKey: event.issueKey, contentHash: event.contentHash, revision,
    }).where(eq(jiraRequirementSources.requirementId, requirementId));
    if (!contentChanged) return { status: "unchanged" as const, revision };

    await tx.insert(jiraRequirementRevisions).values({
      requirementId, revision, sourceUpdatedAt: event.updatedAt, title: event.title, description: event.description,
      sourceDescription: event.sourceDescription,
    });
    await tx.update(requirements).set({
      title: event.title, description: event.description, updatedAt: new Date(),
    }).where(eq(requirements.id, requirementId));
    await audit(tx, { workspaceId, requirementId, action: "requirement.jira.sync", metadata: {
      origin: source.origin, projectId: source.projectId, issueId: source.issueId,
      issueKey: event.issueKey, sourceUpdatedAt: event.updatedAt.toISOString(), revision,
    } });
    return { status: "updated" as const, revision };
  });
}

export const jiraCoverageEdge = (id: string) => and(eq(qualityEdges.relation, "covers"), or(
  and(eq(qualityEdges.fromType, "requirement"), eq(qualityEdges.fromId, id), eq(qualityEdges.toType, "intent")),
  and(eq(qualityEdges.toType, "requirement"), eq(qualityEdges.toId, id), eq(qualityEdges.fromType, "intent")),
));

export async function reviewJiraCoverage(input: HumanTarget & { edgeId: string; revision: number }) {
  return db.transaction(async (tx) => {
    const { workspaceId, requirementId, revision, edgeId } = input;
    if (!await lockRequirement(tx, workspaceId, requirementId)) return { status: "not_found" as const };
    const source = await getJiraRequirementSource(tx, workspaceId, requirementId);
    if (!source || source.revision !== revision) return { status: "conflict" as const };

    const scope = and(eq(qualityEdges.workspaceId, workspaceId), eq(qualityEdges.id, edgeId), jiraCoverageEdge(requirementId));
    const [edge] = await tx.select({ id: qualityEdges.id, reviewed: qualityEdges.reviewedJiraRevision })
      .from(qualityEdges).where(scope);
    if (!edge) return { status: "not_found" as const };
    if (edge.reviewed >= revision) return { status: "unchanged" as const };
    const [updated] = await tx.update(qualityEdges).set({ reviewedJiraRevision: revision })
      .where(and(scope, lt(qualityEdges.reviewedJiraRevision, revision))).returning({ id: qualityEdges.id });
    if (!updated) return { status: "not_found" as const };
    await audit(tx, { ...input, action: "requirement.jira.review_coverage", metadata: { edgeId, revision } });
    return { status: "reviewed" as const };
  });
}


export async function listJiraRequirementRevisions(workspaceId: string, requirementId: string, beforeRevision?: number) {
  const source = await getJiraRequirementSource(db, workspaceId, requirementId);
  if (!source) return null;
  const pageSize = 10;
  const records = await db.select({
    revision: jiraRequirementRevisions.revision, title: jiraRequirementRevisions.title,
    description: jiraRequirementRevisions.description, sourceUpdatedAt: jiraRequirementRevisions.sourceUpdatedAt,
  }).from(jiraRequirementRevisions).where(and(
    eq(jiraRequirementRevisions.requirementId, requirementId),
    beforeRevision === undefined ? undefined : lt(jiraRequirementRevisions.revision, beforeRevision),
  )).orderBy(desc(jiraRequirementRevisions.revision)).limit(pageSize + 1);
  const revisions = records.slice(0, pageSize);
  return {
    source: jiraRequirementSourceView(source),
    revisions,
    nextBeforeRevision: records.length > pageSize ? revisions.at(-1)!.revision : null,
  };
}
