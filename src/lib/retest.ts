import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cases, runs, runResults, resultCaseLinks, retestSources } from "@/db/schema";
import { seedManualRunResults } from "@/lib/tcm/seed-run";
import { allCasesReady, lockCaseReviewPolicy } from "@/lib/case-review-policy";

export async function prepareRetest(workspaceId: string, resultIds: string[], executor: Pick<typeof db, "select"> = db) {
  const rows = await executor.select({ id: runResults.id, caseId: cases.id, title: runResults.title, status: runResults.status, caseTitle: cases.title, caseKey: cases.key, runId: runs.id, runName: runs.name })
    .from(runResults).innerJoin(runs, eq(runs.id, runResults.runId)).leftJoin(resultCaseLinks, eq(resultCaseLinks.resultId, runResults.id)).leftJoin(cases, and(eq(cases.id, sql`coalesce(${runResults.caseId}, ${resultCaseLinks.caseId})`), eq(cases.workspaceId, workspaceId)))
    .where(and(eq(runs.workspaceId, workspaceId), inArray(runResults.id, resultIds)));
  if (rows.length !== new Set(resultIds).size) return null;
  const ordered = [...new Set(resultIds)].map((id) => rows.find((row) => row.id === id)!);
  const eligible = ordered.filter((row) => row.caseId && row.caseKey && ["failed", "blocked"].includes(row.status));
  const excluded = ordered.filter((row) => !eligible.includes(row)).map((row) => ({ ...row, reason: !row.caseId ? "Link an executable case before retesting" : "Only failed or blocked results can be retested" }));
  return { eligible, excluded, caseIds: [...new Set(eligible.map((row) => row.caseId!))] };
}

export async function createRetestRun(input: {
  workspaceId: string;
  actorId: string;
  assigneeId?: string;
  readyOnly?: boolean;
  name: string;
  description: string;
  environment: string;
  sourceResultIds: string[];
}, tx: Parameters<Parameters<typeof db.transaction>[0]>[0]) {
  const readyOnly = (await lockCaseReviewPolicy(tx, input.workspaceId)) || input.readyOnly;
  const draft = await prepareRetest(input.workspaceId, input.sourceResultIds, tx);
  if (!draft || draft.excluded.length || !draft.caseIds.length) return null;
  if (readyOnly && !await allCasesReady(tx, input.workspaceId, draft.caseIds)) return null;
  const [created] = await tx.insert(runs).values({
    workspaceId: input.workspaceId,
    name: input.name,
    description: input.description,
    environment: input.environment,
    createdById: input.actorId,
    assigneeId: input.assigneeId,
    kind: "manual",
    source: "retest",
    status: "planned",
  }).returning();
  await seedManualRunResults({
    workspaceId: input.workspaceId, runId: created.id, caseIds: draft.caseIds,
  }, tx);
  const targets = await tx.select({ id: runResults.id, caseId: runResults.caseId })
    .from(runResults).where(eq(runResults.runId, created.id));
  await tx.insert(retestSources).values(draft.eligible.flatMap((source) =>
    targets.filter((result) => result.caseId === source.caseId)
      .map((result) => ({ sourceResultId: source.id, resultId: result.id })),
  ));
  return created;
}
