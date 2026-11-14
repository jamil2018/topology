import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { cases, runs, runResults, resultCaseLinks } from "@/db/schema";
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
