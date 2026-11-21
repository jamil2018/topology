import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
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
  testPlans,
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

export type MilestoneDetailView = Awaited<
  ReturnType<typeof getMilestoneDetail>
>;

/** Milestone readiness plus linked plans, runs, and scoped gate blockers. */
export async function getMilestoneDetail(
  workspaceId: string,
  milestoneId: string,
) {
  const views = await listMilestonesWithReadiness(workspaceId);
  const view = views.find((v) => v.milestone.id === milestoneId);
  if (!view) return null;

  const plans = await db.query.testPlans.findMany({
    where: and(
      eq(testPlans.workspaceId, workspaceId),
      eq(testPlans.milestoneId, milestoneId),
    ),
    orderBy: [asc(testPlans.name)],
    with: { runs: true },
  });

  const planRuns = plans.flatMap((plan) =>
    plan.runs.map((run) => ({
      id: run.id,
      name: run.name,
      status: run.status,
      planId: plan.id,
      planName: plan.name,
      completedAt: run.completedAt,
      updatedAt: run.updatedAt,
    })),
  );
  const activeRuns = planRuns.filter(
    (r) => r.status === "in_progress" || r.status === "planned",
  );
  const completedRuns = planRuns.filter((r) => r.status === "completed");

  const { suiteCases, openBlockers } = await loadReadinessInputs(workspaceId);
  const scoped = view.milestone.folderId
    ? suiteCases.filter((c) => c.folderId === view.milestone.folderId)
    : suiteCases;
  const caseIdSet = new Set(scoped.map((c) => c.id));

  const blockerIssues = openBlockers.filter(
    (i) =>
      (i.caseId && caseIdSet.has(i.caseId)) ||
      (!view.milestone.folderId && !i.caseId),
  );

  const blockerCaseIds = [
    ...new Set(
      blockerIssues
        .map((b) => b.caseId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const caseKeys =
    blockerCaseIds.length === 0
      ? new Map<string, string>()
      : new Map(
          (
            await db
              .select({ id: cases.id, key: cases.key })
              .from(cases)
              .where(inArray(cases.id, blockerCaseIds))
          ).map((row) => [row.id, row.key]),
        );

  return {
    ...view,
    plans: plans.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      runCount: p.runs.length,
    })),
    activeRuns,
    completedRuns,
    gateBlockers: {
      reasons: view.readiness.reasons,
      issues: blockerIssues.map((issue) => ({
        id: issue.id,
        title: issue.title,
        provider: issue.provider,
        remoteKey: issue.remoteKey,
        url: issue.url,
        caseId: issue.caseId,
        caseKey: issue.caseId ? (caseKeys.get(issue.caseId) ?? null) : null,
      })),
    },
  };
}
