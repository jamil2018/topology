import { and, desc, eq, sql } from "drizzle-orm";
import {
  computeMilestoneReadiness,
  latestOutcomeByCase,
  readinessBadgeLabel,
  type MilestoneCase,
} from "@topology/domain";
import { db } from "@/db";
import {
  cases,
  linkedIssues,
  milestones,
  runResults,
  runs,
  type Case,
} from "@/db/schema";

async function loadReadinessInputs(workspaceId: string) {
  const [milestoneRows, suiteCases, latestResults, openBlockers] =
    await Promise.all([
      db.query.milestones.findMany({
        where: eq(milestones.workspaceId, workspaceId),
        orderBy: [desc(milestones.updatedAt)],
      }),
      db
        .select({
          id: cases.id,
          key: cases.key,
          priority: cases.priority,
          status: cases.status,
          folderId: cases.folderId,
        })
        .from(cases)
        .where(eq(cases.workspaceId, workspaceId)),
      db
        .selectDistinctOn([runResults.caseId], {
          caseId: runResults.caseId,
          status: runResults.status,
          executedAt: runResults.executedAt,
        })
        .from(runResults)
        .innerJoin(runs, eq(runResults.runId, runs.id))
        .where(eq(runs.workspaceId, workspaceId))
        .orderBy(
          runResults.caseId,
          sql`${runResults.executedAt} desc nulls last`,
        ),
      db.query.linkedIssues.findMany({
        where: and(
          eq(linkedIssues.workspaceId, workspaceId),
          eq(linkedIssues.remoteStatus, "open"),
        ),
      }),
    ]);

  return { milestoneRows, suiteCases, latestResults, openBlockers };
}

function readinessForMilestone(
  milestone: typeof milestones.$inferSelect,
  suiteCases: Array<{
    id: string;
    key: string;
    priority: Case["priority"];
    status: Case["status"];
    folderId: string | null;
  }>,
  latestByCase: Map<string, string>,
  openBlockers: Array<{ caseId: string | null }>,
) {
  const scoped = milestone.folderId
    ? suiteCases.filter((c) => c.folderId === milestone.folderId)
    : suiteCases;
  const caseIdSet = new Set(scoped.map((c) => c.id));

  const milestoneCases: MilestoneCase[] = scoped.map((c) => ({
    key: c.key,
    priority: c.priority,
    status: c.status,
    lastResult: (latestByCase.get(c.id) as MilestoneCase["lastResult"]) ?? null,
  }));

  const openBlockerIssues = openBlockers.filter(
    (i) =>
      (i.caseId && caseIdSet.has(i.caseId)) ||
      (!milestone.folderId && !i.caseId),
  ).length;

  const readiness = computeMilestoneReadiness(
    { cases: milestoneCases, openBlockerIssues },
    {
      minPassRate: milestone.passRateThreshold,
      maxOpenP0Failures: milestone.maxOpenP0Failures,
      minExecutedPct: milestone.minExecutedPct,
      maxOpenBlockers: milestone.maxOpenBlockers,
      requireReadyCases: true,
    },
  );

  return {
    milestone,
    readiness,
    badge: readinessBadgeLabel(readiness.status),
  };
}

export async function listMilestonesWithReadiness(workspaceId: string) {
  const { milestoneRows, suiteCases, latestResults, openBlockers } =
    await loadReadinessInputs(workspaceId);
  const latestByCase = latestOutcomeByCase(latestResults);
  return milestoneRows.map((milestone) =>
    readinessForMilestone(milestone, suiteCases, latestByCase, openBlockers),
  );
}

export async function getActiveMilestoneReadiness(workspaceId: string) {
  const views = await listMilestonesWithReadiness(workspaceId);
  for (const view of views) {
    if (view.milestone.status !== "active") continue;
    if (view.readiness.status === "unknown") continue;
    return view;
  }
  return null;
}
