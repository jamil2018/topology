import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { cases, folders, runResults, runs } from "@/db/schema";

export async function getHubPulse() {
  const [caseStats] = await db
    .select({
      total: count(),
      ready: sql<number>`count(*) filter (where ${cases.status} = 'ready')`,
      blocked: sql<number>`count(*) filter (where ${cases.status} = 'blocked')`,
      draft: sql<number>`count(*) filter (where ${cases.status} = 'draft')`,
    })
    .from(cases);

  const [runStats] = await db
    .select({
      total: count(),
      inProgress: sql<number>`count(*) filter (where ${runs.status} = 'in_progress')`,
      completed: sql<number>`count(*) filter (where ${runs.status} = 'completed')`,
    })
    .from(runs);

  const [resultStats] = await db
    .select({
      passed: sql<number>`count(*) filter (where ${runResults.status} = 'passed')`,
      failed: sql<number>`count(*) filter (where ${runResults.status} = 'failed')`,
      untested: sql<number>`count(*) filter (where ${runResults.status} = 'untested')`,
      total: count(),
    })
    .from(runResults);

  const folderCount = await db.select({ value: count() }).from(folders);

  const recentRuns = await db.query.runs.findMany({
    orderBy: [desc(runs.updatedAt)],
    limit: 5,
  });

  const passed = Number(resultStats?.passed ?? 0);
  const failed = Number(resultStats?.failed ?? 0);
  const totalResults = Number(resultStats?.total ?? 0);
  const executed = passed + failed;
  const passRate = executed === 0 ? null : Math.round((passed / executed) * 100);

  return {
    cases: {
      total: Number(caseStats?.total ?? 0),
      ready: Number(caseStats?.ready ?? 0),
      blocked: Number(caseStats?.blocked ?? 0),
      draft: Number(caseStats?.draft ?? 0),
    },
    runs: {
      total: Number(runStats?.total ?? 0),
      inProgress: Number(runStats?.inProgress ?? 0),
      completed: Number(runStats?.completed ?? 0),
    },
    results: {
      passed,
      failed,
      untested: Number(resultStats?.untested ?? 0),
      total: totalResults,
      passRate,
    },
    folders: Number(folderCount[0]?.value ?? 0),
    recentRuns,
  };
}

export async function listCases(folderId?: string | null) {
  if (folderId) {
    return db.query.cases.findMany({
      where: eq(cases.folderId, folderId),
      with: { folder: true },
      orderBy: [desc(cases.updatedAt)],
    });
  }
  return db.query.cases.findMany({
    with: { folder: true },
    orderBy: [desc(cases.updatedAt)],
  });
}

export async function listFolders() {
  return db.query.folders.findMany({
    orderBy: [folders.name],
  });
}

export async function getRunWithResults(runId: string) {
  return db.query.runs.findFirst({
    where: eq(runs.id, runId),
    with: {
      results: {
        with: { case: true },
      },
    },
  });
}

export async function listRuns() {
  return db.query.runs.findMany({
    orderBy: [desc(runs.updatedAt)],
  });
}

export function runProgress(
  results: Array<{ status: string }>,
): { done: number; total: number; pct: number } {
  const total = results.length;
  const done = results.filter((r) => r.status !== "untested").length;
  return {
    done,
    total,
    pct: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

export { and, eq, sql };
