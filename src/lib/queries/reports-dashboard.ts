import { and, asc, count, desc, eq, gte, lte, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import {
  cases,
  folders,
  runResults,
  runs,
  testPlans,
  users,
} from "@/db/schema";
import {
  computePassRate,
  type SuiteBreakdownRow,
} from "@/lib/report-stats";
import {
  type ReportsDashboardModel,
  type ReportsDashboardQuery,
  rangeToDateBounds,
} from "@/lib/report-dashboard";
import { listMilestonesWithReadiness } from "@/lib/queries/milestones";

function completedRunWhere(
  workspaceId: string,
  query: ReportsDashboardQuery,
): SQL | undefined {
  const { from, to } = rangeToDateBounds(query.range);
  const fromIso = from?.toISOString();
  const toIso = to.toISOString();
  return and(
    eq(runs.workspaceId, workspaceId),
    eq(runs.status, "completed"),
    fromIso
      ? gte(sql`coalesce(${runs.completedAt}, ${runs.updatedAt})`, fromIso)
      : undefined,
    lte(sql`coalesce(${runs.completedAt}, ${runs.updatedAt})`, toIso),
    query.planId ? eq(runs.planId, query.planId) : undefined,
    query.environment ? eq(runs.environment, query.environment) : undefined,
  );
}

export async function getReportsDashboard(
  workspaceId: string,
  query: ReportsDashboardQuery,
): Promise<ReportsDashboardModel> {
  const runWhere = completedRunWhere(workspaceId, query);

  const [
    kpiRows,
    trendRows,
    suiteRows,
    testerRows,
    failingRows,
    planRows,
    envRows,
    readinessViews,
  ] = await Promise.all([
    db
      .select({
        runs: sql<number>`count(distinct ${runs.id})`,
        passed: sql<number>`count(*) filter (where ${runResults.status} = 'passed')`,
        failed: sql<number>`count(*) filter (where ${runResults.status} = 'failed')`,
        skipped: sql<number>`count(*) filter (where ${runResults.status} = 'skipped')`,
        blocked: sql<number>`count(*) filter (where ${runResults.status} = 'blocked')`,
      })
      .from(runResults)
      .innerJoin(runs, eq(runResults.runId, runs.id))
      .where(runWhere),
    db
      .select({
        date: sql<string>`to_char(date_trunc('day', coalesce(${runs.completedAt}, ${runs.updatedAt})), 'YYYY-MM-DD')`,
        passed: sql<number>`count(*) filter (where ${runResults.status} = 'passed')`,
        failed: sql<number>`count(*) filter (where ${runResults.status} = 'failed')`,
      })
      .from(runResults)
      .innerJoin(runs, eq(runResults.runId, runs.id))
      .where(runWhere)
      .groupBy(
        sql`date_trunc('day', coalesce(${runs.completedAt}, ${runs.updatedAt}))`,
      )
      .orderBy(
        sql`date_trunc('day', coalesce(${runs.completedAt}, ${runs.updatedAt}))`,
      ),
    db
      .select({
        key: sql<string>`coalesce(${folders.id}::text, ${runResults.classname}, 'unfiled')`,
        label: sql<string>`coalesce(${folders.name}, ${runResults.classname}, 'Unfiled')`,
        passed: sql<number>`count(*) filter (where ${runResults.status} = 'passed')`,
        failed: sql<number>`count(*) filter (where ${runResults.status} = 'failed')`,
        skipped: sql<number>`count(*) filter (where ${runResults.status} = 'skipped')`,
        blocked: sql<number>`count(*) filter (where ${runResults.status} = 'blocked')`,
        untested: sql<number>`count(*) filter (where ${runResults.status} = 'untested')`,
        total: count(),
      })
      .from(runResults)
      .innerJoin(runs, eq(runResults.runId, runs.id))
      .leftJoin(cases, eq(runResults.caseId, cases.id))
      .leftJoin(folders, eq(cases.folderId, folders.id))
      .where(runWhere)
      .groupBy(
        folders.id,
        folders.name,
        runResults.classname,
      )
      .orderBy(sql`count(*) filter (where ${runResults.status} = 'failed') desc`)
      .limit(12),
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        passed: sql<number>`count(*) filter (where ${runResults.status} = 'passed')`,
        failed: sql<number>`count(*) filter (where ${runResults.status} = 'failed')`,
        executed: sql<number>`count(*) filter (where ${runResults.status} in ('passed', 'failed'))`,
      })
      .from(runResults)
      .innerJoin(runs, eq(runResults.runId, runs.id))
      .innerJoin(users, eq(runResults.executedById, users.id))
      .where(runWhere)
      .groupBy(users.id, users.name, users.email)
      .orderBy(sql`count(*) filter (where ${runResults.status} in ('passed', 'failed')) desc`)
      .limit(8),
    db
      .select({
        caseId: cases.id,
        caseKey: sql<string>`coalesce(${cases.key}, ${runResults.externalKey}, '—')`,
        title: sql<string>`coalesce(${cases.title}, ${runResults.title}, 'Untitled')`,
        failCount: count(),
      })
      .from(runResults)
      .innerJoin(runs, eq(runResults.runId, runs.id))
      .leftJoin(cases, eq(runResults.caseId, cases.id))
      .where(and(runWhere, eq(runResults.status, "failed")))
      .groupBy(cases.id, cases.key, cases.title, runResults.externalKey, runResults.title)
      .orderBy(desc(count()))
      .limit(8),
    db
      .select({ id: testPlans.id, name: testPlans.name })
      .from(testPlans)
      .where(eq(testPlans.workspaceId, workspaceId))
      .orderBy(asc(testPlans.name)),
    db
      .selectDistinct({ environment: runs.environment })
      .from(runs)
      .where(eq(runs.workspaceId, workspaceId))
      .orderBy(asc(runs.environment)),
    listMilestonesWithReadiness(workspaceId),
  ]);

  const kpi = kpiRows[0];
  const passed = Number(kpi?.passed ?? 0);
  const failed = Number(kpi?.failed ?? 0);
  const skipped = Number(kpi?.skipped ?? 0);
  const blocked = Number(kpi?.blocked ?? 0);

  const bySuite: SuiteBreakdownRow[] = suiteRows.map((row) => {
    const rowPassed = Number(row.passed ?? 0);
    const rowFailed = Number(row.failed ?? 0);
    return {
      key: row.key,
      label: row.label,
      passed: rowPassed,
      failed: rowFailed,
      skipped: Number(row.skipped ?? 0),
      blocked: Number(row.blocked ?? 0),
      untested: Number(row.untested ?? 0),
      total: Number(row.total ?? 0),
      passRate: computePassRate(rowPassed, rowFailed),
    };
  });

  return {
    query,
    options: {
      plans: planRows,
      environments: envRows
        .map((row) => row.environment)
        .filter((name): name is string => Boolean(name)),
    },
    kpis: {
      runs: Number(kpi?.runs ?? 0),
      passed,
      failed,
      skipped,
      blocked,
      executed: passed + failed,
      passRate: computePassRate(passed, failed),
    },
    trend: trendRows.map((row) => {
      const dayPassed = Number(row.passed ?? 0);
      const dayFailed = Number(row.failed ?? 0);
      return {
        date: row.date,
        passed: dayPassed,
        failed: dayFailed,
        passRate: computePassRate(dayPassed, dayFailed),
      };
    }),
    bySuite,
    readiness: readinessViews
      .filter((view) => view.milestone.status === "active")
      .slice(0, 6)
      .map((view) => ({
        id: view.milestone.id,
        name: view.milestone.name,
        status: view.readiness.status,
        score: view.readiness.score,
        passRate: view.readiness.passRate,
        badge: view.badge,
        reasons: view.readiness.reasons,
        passRateThreshold: view.milestone.passRateThreshold,
      })),
    testers: testerRows.map((row) => {
      const rowPassed = Number(row.passed ?? 0);
      const rowFailed = Number(row.failed ?? 0);
      return {
        id: row.id,
        name: row.name?.trim() || row.email,
        executed: Number(row.executed ?? 0),
        passed: rowPassed,
        failed: rowFailed,
        passRate: computePassRate(rowPassed, rowFailed),
      };
    }),
    topFailing: failingRows.map((row) => ({
      caseId: row.caseId,
      caseKey: row.caseKey,
      title: row.title,
      failCount: Number(row.failCount ?? 0),
    })),
  };
}
