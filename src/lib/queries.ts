import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import {
  buildTriageQueue,
  computeMilestoneReadiness,
  latestOutcomeByCase,
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
  savedViews,
  triageItems,
} from "@/db/schema";
import { listRetestQueue } from "@/lib/issues";
import { parseCaseViewConfig, parseRunViewConfig } from "@/lib/saved-views";
import {
  buildReportKpis,
  buildResultTimeline,
  buildSuiteBreakdown,
  failureRowsFromResults,
} from "@/lib/report-stats";

export async function getHubPulse(workspaceId: string) {
  const [caseStats] = await db
    .select({
      total: count(),
      ready: sql<number>`count(*) filter (where ${cases.status} = 'ready')`,
      blocked: sql<number>`count(*) filter (where ${cases.status} = 'blocked')`,
      draft: sql<number>`count(*) filter (where ${cases.status} = 'draft')`,
    })
    .from(cases)
    .where(eq(cases.workspaceId, workspaceId));

  const [runStats] = await db
    .select({
      total: count(),
      inProgress: sql<number>`count(*) filter (where ${runs.status} = 'in_progress')`,
      completed: sql<number>`count(*) filter (where ${runs.status} = 'completed')`,
      automation: sql<number>`count(*) filter (where ${runs.kind} = 'automation')`,
    })
    .from(runs)
    .where(eq(runs.workspaceId, workspaceId));

  const [resultStats] = await db
    .select({
      passed: sql<number>`count(*) filter (where ${runResults.status} = 'passed')`,
      failed: sql<number>`count(*) filter (where ${runResults.status} = 'failed')`,
      untested: sql<number>`count(*) filter (where ${runResults.status} = 'untested')`,
      total: count(),
    })
    .from(runResults)
    .innerJoin(runs, eq(runResults.runId, runs.id))
    .where(eq(runs.workspaceId, workspaceId));

  const [triageStats] = await db
    .select({
      open: sql<number>`count(*) filter (where ${triageItems.status} = 'open')`,
    })
    .from(triageItems)
    .where(eq(triageItems.workspaceId, workspaceId));

  const folderCount = await db
    .select({ value: count() })
    .from(folders)
    .where(eq(folders.workspaceId, workspaceId));

  const recentRuns = await db.query.runs.findMany({
    where: eq(runs.workspaceId, workspaceId),
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

  const flakeSuspects = await countFlakeSuspects(workspaceId);
  const openLinked = await db
    .select({ value: count() })
    .from(linkedIssues)
    .where(
      and(
        eq(linkedIssues.workspaceId, workspaceId),
        eq(linkedIssues.remoteStatus, "open"),
      ),
    );
  const retestQueue = await listRetestQueue(workspaceId);

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

async function countFlakeSuspects(workspaceId: string): Promise<number> {
  const recent = await db
    .select({
      caseId: runResults.caseId,
      status: runResults.status,
      executedAt: runResults.executedAt,
      createdAt: runResults.createdAt,
    })
    .from(runResults)
    .innerJoin(runs, eq(runResults.runId, runs.id))
    .where(
      and(
        eq(runs.workspaceId, workspaceId),
        sql`${runResults.status} in ('passed', 'failed')`,
      ),
    )
    .orderBy(desc(runResults.executedAt))
    .limit(500);

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

export async function listCases(
  workspaceId: string,
  folderId?: string | null,
) {
  if (folderId) {
    return db.query.cases.findMany({
      where: and(
        eq(cases.workspaceId, workspaceId),
        eq(cases.folderId, folderId),
      ),
      with: { folder: true },
      orderBy: [desc(cases.updatedAt)],
    });
  }
  return db.query.cases.findMany({
    where: eq(cases.workspaceId, workspaceId),
    with: { folder: true },
    orderBy: [desc(cases.updatedAt)],
  });
}

export async function listFolders(workspaceId: string) {
  return db.query.folders.findMany({
    where: eq(folders.workspaceId, workspaceId),
    orderBy: [folders.name],
  });
}

export async function listSavedViews(
  workspaceId: string,
  entity: "cases" | "runs",
  userId: string,
) {
  const rows = await db.query.savedViews.findMany({
    where: and(
      eq(savedViews.workspaceId, workspaceId),
      eq(savedViews.entity, entity),
      eq(savedViews.createdById, userId),
    ),
    orderBy: [desc(savedViews.updatedAt)],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    entity: row.entity,
    config:
      row.entity === "cases"
        ? parseCaseViewConfig(row.configJson)
        : parseRunViewConfig(row.configJson),
  }));
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(id: string): boolean {
  return UUID_RE.test(id);
}

export async function getRunWithResults(workspaceId: string, runId: string) {
  if (!isUuid(runId)) return null;
  return db.query.runs.findFirst({
    where: and(eq(runs.id, runId), eq(runs.workspaceId, workspaceId)),
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

export async function listRuns(
  workspaceId: string,
  kind?: "manual" | "automation",
) {
  if (kind) {
    return db.query.runs.findMany({
      where: and(eq(runs.workspaceId, workspaceId), eq(runs.kind, kind)),
      orderBy: [desc(runs.updatedAt)],
    });
  }
  return db.query.runs.findMany({
    where: eq(runs.workspaceId, workspaceId),
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

export async function getActiveMilestoneReadiness(workspaceId: string) {
  const rows = await db.query.milestones.findMany({
    where: and(
      eq(milestones.workspaceId, workspaceId),
      eq(milestones.status, "active"),
    ),
    orderBy: [desc(milestones.updatedAt)],
  });

  for (const milestone of rows) {
    const view = await computeReadinessForMilestone(milestone);
    if (view.readiness.status === "unknown") continue;
    return view;
  }

  return null;
}

export async function listMilestonesWithReadiness(workspaceId: string) {
  const rows = await db.query.milestones.findMany({
    where: eq(milestones.workspaceId, workspaceId),
    orderBy: [desc(milestones.updatedAt)],
  });
  const results = [];
  for (const milestone of rows) {
    results.push(await computeReadinessForMilestone(milestone));
  }
  return results;
}

async function computeReadinessForMilestone(
  milestone: typeof milestones.$inferSelect,
) {
  const suiteCases = milestone.folderId
    ? await db.query.cases.findMany({
        where: and(
          eq(cases.workspaceId, milestone.workspaceId),
          eq(cases.folderId, milestone.folderId),
        ),
      })
    : await db.query.cases.findMany({
        where: eq(cases.workspaceId, milestone.workspaceId),
      });

  const caseIds = suiteCases.map((c) => c.id);
  const recentResults =
    caseIds.length === 0
      ? []
      : await db
          .selectDistinctOn([runResults.caseId], {
            caseId: runResults.caseId,
            status: runResults.status,
            executedAt: runResults.executedAt,
          })
          .from(runResults)
          .innerJoin(runs, eq(runResults.runId, runs.id))
          .where(
            and(
              eq(runs.workspaceId, milestone.workspaceId),
              inArray(runResults.caseId, caseIds),
            ),
          )
          .orderBy(
            runResults.caseId,
            sql`${runResults.executedAt} desc nulls last`,
          );
  const latestByCase = latestOutcomeByCase(recentResults);

  const milestoneCases: MilestoneCase[] = suiteCases.map((c) => ({
    key: c.key,
    priority: c.priority,
    status: c.status,
    lastResult: (latestByCase.get(c.id) as MilestoneCase["lastResult"]) ?? null,
  }));

  const caseIdSet = new Set(caseIds);
  const openBlockers = await db.query.linkedIssues.findMany({
    where: and(
      eq(linkedIssues.workspaceId, milestone.workspaceId),
      eq(linkedIssues.remoteStatus, "open"),
    ),
  });
  const openBlockerIssues = openBlockers.filter(
    (i) =>
      (i.caseId && caseIdSet.has(i.caseId)) ||
      // Treat open issues without a case as blockers for project-wide milestones
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

export async function getTriageQueue(workspaceId: string) {
  const open = await db.query.triageItems.findMany({
    where: and(
      eq(triageItems.workspaceId, workspaceId),
      eq(triageItems.status, "open"),
    ),
    with: { case: true, run: true },
    orderBy: [desc(triageItems.lastSeenAt)],
  });

  const linked = await db.query.linkedIssues.findMany({
    where: eq(linkedIssues.workspaceId, workspaceId),
  });
  const linkedResultIds = new Set(
    linked.map((i) => i.resultId).filter(Boolean) as string[],
  );

  // Failure triage = open items whose result still lacks a linked issue
  const withoutIssue = open.filter(
    (item) => !item.resultId || !linkedResultIds.has(item.resultId),
  );

  const failures: TriageFailure[] = withoutIssue.map((item) => ({
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
    withoutIssue.map((o) => o.caseId).filter(Boolean) as string[],
  );

  const withFlake = failures.map((f) => {
    const item = withoutIssue.find((o) => o.id === f.id);
    const hint = item?.caseId ? flakeHints.get(item.caseId) : undefined;
    return {
      ...f,
      isFlaky: hint?.isFlaky ?? false,
    };
  });

  return buildTriageQueue(withFlake).map((item) => {
    const source = withoutIssue.find((o) => o.id === item.id);
    return {
      ...item,
      resultId: source?.resultId ?? null,
      caseId: source?.caseId ?? null,
      flakeHint: source?.caseId
        ? (flakeHints.get(source.caseId)?.hint ?? null)
        : null,
    };
  });
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

export async function getFlakeHints(workspaceId: string, limit = 20) {
  const allCases = await db.query.cases.findMany({
    where: eq(cases.workspaceId, workspaceId),
    limit: 200,
  });
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

/** One report per completed run — list summaries for the Reports surface. */
export async function listRunReports(workspaceId: string) {
  const allRuns = await db.query.runs.findMany({
    where: and(
      eq(runs.workspaceId, workspaceId),
      eq(runs.status, "completed"),
    ),
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

/** Full report for a single completed run (manual or CI). */
export async function getRunReport(workspaceId: string, runId: string) {
  if (!isUuid(runId)) return null;
  const run = await db.query.runs.findFirst({
    where: and(
      eq(runs.id, runId),
      eq(runs.workspaceId, workspaceId),
      eq(runs.status, "completed"),
    ),
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

  const recentPeerRuns = await listRunReports(workspaceId);
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
