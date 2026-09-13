import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  buildTriageQueue,
  computeMilestoneReadiness,
  computeQualityPulse,
  detectFlakeSignal,
  readinessBadgeLabel,
  type MilestoneCase,
  type TriageFailure,
} from "@topology/domain";
import { db } from "@/db";
import {
  cases,
  folders,
  linkedIssues,
  milestones,
  runResults,
  runs,
  triageItems,
} from "@/db/schema";
import { listRetestQueue } from "@/lib/issues";
import {
  buildReportKpis,
  buildResultTimeline,
  buildSuiteBreakdown,
  failureRowsFromResults,
} from "@/lib/report-stats";

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
      automation: sql<number>`count(*) filter (where ${runs.kind} = 'automation')`,
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

  const [triageStats] = await db
    .select({
      open: sql<number>`count(*) filter (where ${triageItems.status} = 'open')`,
    })
    .from(triageItems);

  const folderCount = await db.select({ value: count() }).from(folders);

  const recentRuns = await db.query.runs.findMany({
    orderBy: [desc(runs.updatedAt)],
    limit: 8,
  });

  const recentRunIds = recentRuns.map((run) => run.id);
  const runResultCounts =
    recentRunIds.length === 0
      ? []
      : await db
          .select({
            runId: runResults.runId,
            passed: sql<number>`count(*) filter (where ${runResults.status} = 'passed')`,
            failed: sql<number>`count(*) filter (where ${runResults.status} = 'failed')`,
            untested: sql<number>`count(*) filter (where ${runResults.status} = 'untested')`,
          })
          .from(runResults)
          .where(inArray(runResults.runId, recentRunIds))
          .groupBy(runResults.runId);

  const countsByRun = new Map(
    runResultCounts.map((row) => [
      row.runId,
      {
        passed: Number(row.passed ?? 0),
        failed: Number(row.failed ?? 0),
        untested: Number(row.untested ?? 0),
      },
    ]),
  );

  const flakeSuspects = await countFlakeSuspects();
  const openLinked = await db
    .select({ value: count() })
    .from(linkedIssues)
    .where(eq(linkedIssues.remoteStatus, "open"));
  const retestQueue = await listRetestQueue();

  const passed = Number(resultStats?.passed ?? 0);
  const failed = Number(resultStats?.failed ?? 0);
  const totalResults = Number(resultStats?.total ?? 0);
  const executed = passed + failed;
  const passRate = executed === 0 ? null : Math.round((passed / executed) * 100);

  const quality = computeQualityPulse({
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
      automation: Number(runStats?.automation ?? 0),
    },
    results: {
      passed,
      failed,
      untested: Number(resultStats?.untested ?? 0),
      total: totalResults,
    },
    triageOpen: Number(triageStats?.open ?? 0),
    flakeSuspects,
  });

  const recentRunsWithCounts = recentRuns.map((run) => {
    const counts = countsByRun.get(run.id) ?? {
      passed: 0,
      failed: 0,
      untested: 0,
    };
    return {
      ...run,
      passed: counts.passed,
      failed: counts.failed,
      untested: counts.untested,
    };
  });

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
      automation: Number(runStats?.automation ?? 0),
    },
    results: {
      passed,
      failed,
      untested: Number(resultStats?.untested ?? 0),
      total: totalResults,
      passRate,
    },
    folders: Number(folderCount[0]?.value ?? 0),
    recentRuns: recentRunsWithCounts.slice(0, 5),
    runTrend: recentRunsWithCounts,
    quality,
    triageOpen: Number(triageStats?.open ?? 0),
    flakeSuspects,
    openLinkedIssues: Number(openLinked[0]?.value ?? 0),
    retestQueue: retestQueue.slice(0, 8).map((i) => ({
      id: i.id,
      key: i.remoteKey,
      title: i.title,
      caseKey: i.case?.key ?? null,
      runId: i.runId,
      resultId: i.resultId,
    })),
  };
}

async function countFlakeSuspects(): Promise<number> {
  const recent = await db.query.runResults.findMany({
    where: sql`${runResults.status} in ('passed', 'failed')`,
    orderBy: [desc(runResults.executedAt)],
    limit: 500,
    with: { case: true },
  });

  const byCase = new Map<
    string,
    Array<{ status: "passed" | "failed"; at: Date }>
  >();

  for (const row of recent) {
    if (!row.caseId || (row.status !== "passed" && row.status !== "failed")) {
      continue;
    }
    const list = byCase.get(row.caseId) ?? [];
    list.push({
      status: row.status,
      at: row.executedAt ?? row.createdAt,
    });
    byCase.set(row.caseId, list);
  }

  let suspects = 0;
  for (const history of byCase.values()) {
    const signal = detectFlakeSignal(history);
    if (signal.isFlaky) suspects += 1;
  }
  return suspects;
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
        with: {
          case: true,
          linkedIssues: true,
          comments: { with: { user: true } },
          attachments: true,
          assignee: true,
        },
      },
      linkedIssues: true,
      assignee: true,
    },
  });
}

export async function listRuns(kind?: "manual" | "automation") {
  if (kind) {
    return db.query.runs.findMany({
      where: eq(runs.kind, kind),
      orderBy: [desc(runs.updatedAt)],
    });
  }
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

export async function getActiveMilestoneReadiness() {
  const milestone = await db.query.milestones.findFirst({
    where: eq(milestones.status, "active"),
    orderBy: [desc(milestones.updatedAt)],
  });

  if (!milestone) {
    return null;
  }

  const suiteCases = milestone.folderId
    ? await db.query.cases.findMany({
        where: eq(cases.folderId, milestone.folderId),
      })
    : await db.query.cases.findMany();

  const latestByCase = new Map<string, string>();
  const recentResults = await db.query.runResults.findMany({
    orderBy: [desc(runResults.executedAt)],
    limit: 1000,
  });
  for (const result of recentResults) {
    if (!result.caseId) continue;
    if (!latestByCase.has(result.caseId)) {
      latestByCase.set(result.caseId, result.status);
    }
  }

  const milestoneCases: MilestoneCase[] = suiteCases.map((c) => ({
    key: c.key,
    priority: c.priority,
    status: c.status,
    lastResult: (latestByCase.get(c.id) as MilestoneCase["lastResult"]) ?? null,
  }));

  const readiness = computeMilestoneReadiness(milestoneCases, {
    minPassRate: milestone.passRateThreshold,
    maxOpenP0Failures: milestone.maxOpenP0Failures,
    requireReadyCases: true,
  });

  return {
    milestone,
    readiness,
    badge: readinessBadgeLabel(readiness.status),
  };
}

export async function getTriageQueue() {
  const open = await db.query.triageItems.findMany({
    where: eq(triageItems.status, "open"),
    with: { case: true, run: true },
    orderBy: [desc(triageItems.lastSeenAt)],
  });

  const failures: TriageFailure[] = open.map((item) => ({
    id: item.id,
    caseKey: item.case?.key ?? "unknown",
    caseTitle: item.title,
    priority: item.priority,
    runId: item.runId ?? "",
    runName: item.run?.name ?? "unknown run",
    notes: item.notes,
    failedAt: item.lastSeenAt,
    occurrenceCount: item.occurrenceCount,
  }));

  const flakeHints = await getFlakeHintsForCaseIds(
    open.map((o) => o.caseId).filter(Boolean) as string[],
  );

  const withFlake = failures.map((f) => {
    const item = open.find((o) => o.id === f.id);
    const hint = item?.caseId ? flakeHints.get(item.caseId) : undefined;
    return {
      ...f,
      isFlaky: hint?.isFlaky ?? false,
    };
  });

  return buildTriageQueue(withFlake).map((item) => ({
    ...item,
    flakeHint: open.find((o) => o.id === item.id)?.caseId
      ? flakeHints.get(open.find((o) => o.id === item.id)!.caseId!)?.hint
      : null,
  }));
}

async function getFlakeHintsForCaseIds(caseIds: string[]) {
  const map = new Map<
    string,
    ReturnType<typeof detectFlakeSignal>
  >();
  if (caseIds.length === 0) return map;

  for (const caseId of caseIds) {
    const history = await db.query.runResults.findMany({
      where: and(
        eq(runResults.caseId, caseId),
        sql`${runResults.status} in ('passed', 'failed')`,
      ),
      orderBy: [desc(runResults.executedAt)],
      limit: 12,
    });
    const signal = detectFlakeSignal(
      history.map((h) => ({
        status: h.status as "passed" | "failed",
        at: h.executedAt ?? h.createdAt,
      })),
    );
    map.set(caseId, signal);
  }
  return map;
}

export async function getFlakeHints(limit = 20) {
  const allCases = await db.query.cases.findMany({ limit: 200 });
  const hints: Array<{
    caseId: string;
    caseKey: string;
    title: string;
    score: number;
    hint: string;
  }> = [];

  for (const c of allCases) {
    const history = await db.query.runResults.findMany({
      where: and(
        eq(runResults.caseId, c.id),
        sql`${runResults.status} in ('passed', 'failed')`,
      ),
      orderBy: [desc(runResults.executedAt)],
      limit: 12,
    });
    const signal = detectFlakeSignal(
      history.map((h) => ({
        status: h.status as "passed" | "failed",
        at: h.executedAt ?? h.createdAt,
      })),
    );
    if (signal.isFlaky && signal.hint) {
      hints.push({
        caseId: c.id,
        caseKey: c.key,
        title: c.title,
        score: signal.score,
        hint: signal.hint,
      });
    }
  }

  return hints.sort((a, b) => b.score - a.score).slice(0, limit);
}

/** One report per run — list summaries for the Reports surface. */
export async function listRunReports() {
  const allRuns = await db.query.runs.findMany({
    orderBy: [desc(runs.updatedAt)],
    limit: 100,
  });
  if (allRuns.length === 0) return [];

  const ids = allRuns.map((r) => r.id);
  const counts = await db
    .select({
      runId: runResults.runId,
      passed: sql<number>`count(*) filter (where ${runResults.status} = 'passed')`,
      failed: sql<number>`count(*) filter (where ${runResults.status} = 'failed')`,
      skipped: sql<number>`count(*) filter (where ${runResults.status} = 'skipped')`,
      blocked: sql<number>`count(*) filter (where ${runResults.status} = 'blocked')`,
      untested: sql<number>`count(*) filter (where ${runResults.status} = 'untested')`,
      total: count(),
      durationMs: sql<number>`coalesce(sum(${runResults.durationMs}), 0)`,
    })
    .from(runResults)
    .where(inArray(runResults.runId, ids))
    .groupBy(runResults.runId);

  const byRun = new Map(
    counts.map((row) => [
      row.runId,
      {
        passed: Number(row.passed ?? 0),
        failed: Number(row.failed ?? 0),
        skipped: Number(row.skipped ?? 0),
        blocked: Number(row.blocked ?? 0),
        untested: Number(row.untested ?? 0),
        total: Number(row.total ?? 0),
        durationMs: Number(row.durationMs ?? 0) || null,
      },
    ]),
  );

  return allRuns.map((run) => {
    const c = byRun.get(run.id) ?? {
      passed: 0,
      failed: 0,
      skipped: 0,
      blocked: 0,
      untested: 0,
      total: 0,
      durationMs: null as number | null,
    };
    const wall =
      run.startedAt && run.completedAt
        ? Math.max(
            0,
            new Date(run.completedAt).getTime() -
              new Date(run.startedAt).getTime(),
          )
        : null;
    const executed = c.passed + c.failed;
    return {
      runId: run.id,
      name: run.name,
      status: run.status,
      kind: run.kind,
      source: run.source,
      environment: run.environment,
      branch: run.branch,
      commitSha: run.commitSha,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      updatedAt: run.updatedAt,
      createdAt: run.createdAt,
      passed: c.passed,
      failed: c.failed,
      skipped: c.skipped,
      blocked: c.blocked,
      untested: c.untested,
      total: c.total,
      passRate:
        executed === 0 ? null : Math.round((c.passed / executed) * 100),
      durationMs: wall ?? c.durationMs,
    };
  });
}

/** Full report for a single run (manual or CI). */
export async function getRunReport(runId: string) {
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
    with: {
      results: {
        with: {
          case: { with: { folder: true } },
          linkedIssues: true,
        },
      },
    },
  });
  if (!run) return null;

  const resultInputs = run.results.map((r) => ({
    id: r.id,
    status: r.status,
    notes: r.notes,
    durationMs: r.durationMs,
    executedAt: r.executedAt,
    createdAt: r.createdAt,
    classname: r.classname,
    title: r.title,
    externalKey: r.externalKey,
    caseId: r.caseId,
    case: r.case
      ? {
          id: r.case.id,
          key: r.case.key,
          title: r.case.title,
          priority: r.case.priority,
          folder: r.case.folder
            ? { id: r.case.folder.id, name: r.case.folder.name }
            : null,
        }
      : null,
  }));

  const failedCaseIds = [
    ...new Set(
      resultInputs
        .filter((r) => r.status === "failed" || r.status === "blocked")
        .map((r) => r.case?.id ?? r.caseId)
        .filter(Boolean) as string[],
    ),
  ];
  const flakeByCaseId = await getFlakeHintsForCaseIds(failedCaseIds);
  const flakeMap = new Map(
    [...flakeByCaseId.entries()].map(([id, signal]) => [
      id,
      { isFlaky: signal.isFlaky, hint: signal.hint },
    ]),
  );
  const flakeCount = [...flakeMap.values()].filter((f) => f.isFlaky).length;

  const kpis = buildReportKpis(resultInputs, {
    flake: flakeCount,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
  });

  const recentPeerRuns = await listRunReports();
  const trend = recentPeerRuns
    .slice(0, 12)
    .map((r) => ({
      id: r.runId,
      name: r.name,
      passed: r.passed,
      failed: r.failed,
      isCurrent: r.runId === runId,
    }));

  return {
    run: {
      id: run.id,
      name: run.name,
      description: run.description,
      status: run.status,
      kind: run.kind,
      source: run.source,
      environment: run.environment,
      branch: run.branch,
      commitSha: run.commitSha,
      startedAt: run.startedAt,
      completedAt: run.completedAt,
      createdAt: run.createdAt,
      updatedAt: run.updatedAt,
    },
    kpis,
    suiteBreakdown: buildSuiteBreakdown(resultInputs),
    timeline: buildResultTimeline(resultInputs),
    failures: failureRowsFromResults(resultInputs, flakeMap),
    trend,
  };
}

export { and, eq, sql };
