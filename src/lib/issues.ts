import { and, count, desc, eq, inArray, notInArray } from "drizzle-orm";
import {
  buildFailureIssueBody,
  resolveIssueProvider,
  type IssueProviderId,
  type RemoteIssue,
} from "@topology/issue-providers";
import { db } from "@/db";
import { cases, linkedIssues, runResults, runs, triageItems } from "@/db/schema";
import { dispatchWebhook } from "@/lib/webhooks";

export type LinkedIssueRow = typeof linkedIssues.$inferSelect;

function toRowValues(
  remote: RemoteIssue,
  meta: {
    workspaceId: string;
    resultId?: string | null;
    caseId?: string | null;
    runId?: string | null;
    createdById?: string | null;
    previousStatus?: LinkedIssueRow["remoteStatus"] | null;
  },
) {
  const closedNow =
    meta.previousStatus &&
    meta.previousStatus !== "done" &&
    remote.status === "done";
  return {
    workspaceId: meta.workspaceId,
    provider: remote.provider,
    remoteId: remote.id,
    remoteKey: remote.key,
    url: remote.url,
    title: remote.title,
    remoteStatus: remote.status,
    resultId: meta.resultId ?? null,
    caseId: meta.caseId ?? null,
    runId: meta.runId ?? null,
    createdById: meta.createdById ?? null,
    needsRetest: closedNow ? 1 : 0,
    lastSyncedAt: new Date(),
    updatedAt: new Date(),
  };
}

export async function createIssueFromResult(input: {
  resultId: string;
  provider?: IssueProviderId | string;
  title?: string;
  description?: string;
  userId?: string | null;
  projectKey?: string;
  teamId?: string;
  repo?: string;
  /** When set, a result outside this workspace is treated as missing. */
  workspaceId?: string;
}) {
  const result = await db.query.runResults.findFirst({
    where: eq(runResults.id, input.resultId),
    with: { case: true, run: true },
  });
  if (!result) throw new Error("Result not found");

  const workspaceId = result.run?.workspaceId ?? result.case?.workspaceId;
  if (!workspaceId) throw new Error("Result is missing workspace scope");
  if (input.workspaceId && input.workspaceId !== workspaceId) {
    throw new Error("Result not found");
  }
  if (result.status !== "failed" && result.status !== "blocked") {
    throw new Error("Issues can only be filed from failed or blocked results");
  }

  const caseKey = result.case?.key ?? result.externalKey ?? "unknown";
  const caseTitle = result.case?.title ?? result.title ?? "Untitled failure";
  const provider = resolveIssueProvider({ provider: input.provider });
  const title =
    input.title ?? `[${caseKey}] ${caseTitle} — ${result.status}`;
  const description =
    input.description ??
    buildFailureIssueBody({
      caseKey,
      caseTitle,
      resultStatus: result.status,
      notes: result.notes,
      runName: result.run?.name,
      runId: result.run?.id,
      environment: result.run?.environment,
    });

  const remote = await provider.createIssue({
    title,
    description,
    projectKey: input.projectKey,
    teamId: input.teamId,
    repo: input.repo,
    labels: ["topology", result.status],
  });

  const [row] = await db
    .insert(linkedIssues)
    .values(
      toRowValues(remote, {
        workspaceId,
        resultId: result.id,
        caseId: result.caseId,
        runId: result.runId,
        createdById: input.userId,
      }),
    )
    .returning();

  await db
    .update(triageItems)
    .set({ status: "resolved", updatedAt: new Date() })
    .where(eq(triageItems.resultId, result.id));

  void dispatchWebhook(
    "issue.created",
    {
      issue: {
        id: row.id,
        provider: row.provider,
        remoteKey: row.remoteKey,
        url: row.url,
        title: row.title,
        remoteStatus: row.remoteStatus,
      },
      result: {
        id: result.id,
        status: result.status,
        caseKey,
        caseTitle,
        runId: result.runId,
      },
    },
    workspaceId,
  );

  return row;
}

export async function linkExistingIssue(input: {
  resultId: string;
  remoteKey: string;
  provider?: IssueProviderId | string;
  userId?: string | null;
  /** When set, a result outside this workspace is treated as missing. */
  workspaceId?: string;
}) {
  const result = await db.query.runResults.findFirst({
    where: eq(runResults.id, input.resultId),
    with: { case: true, run: true },
  });
  if (!result) throw new Error("Result not found");

  const workspaceId = result.run?.workspaceId ?? result.case?.workspaceId;
  if (!workspaceId) throw new Error("Result is missing workspace scope");
  if (input.workspaceId && input.workspaceId !== workspaceId) {
    throw new Error("Result not found");
  }

  const provider = resolveIssueProvider({ provider: input.provider });
  const remote = await provider.linkExisting(input.remoteKey);

  const [row] = await db
    .insert(linkedIssues)
    .values(
      toRowValues(remote, {
        workspaceId,
        resultId: result.id,
        caseId: result.caseId,
        runId: result.runId,
        createdById: input.userId,
      }),
    )
    .returning();

  if (result.id) {
    await db
      .update(triageItems)
      .set({ status: "resolved", updatedAt: new Date() })
      .where(eq(triageItems.resultId, result.id));
  }

  return row;
}

/**
 * Duplicate mock keys share one in-memory remote object. A refresh must not
 * copy that object's title onto a sibling, or reopen a local close.
 */
export function refreshKeepsLocalFields(input: {
  localRemoteId: string;
  localTitle: string;
  localStatus: string;
  remoteId: string;
  remoteTitle: string;
  remoteStatus: string;
  siblingTitles: string[];
}) {
  const fabricated =
    input.remoteId !== input.localRemoteId ||
    input.remoteId.startsWith("mock-linked-");
  const contested = input.siblingTitles.some(
    (title) => title !== input.localTitle,
  );
  const keepTitle = fabricated || contested;
  const keepStatus =
    keepTitle ||
    (input.localStatus === "done" && input.remoteStatus !== "done");
  return { keepTitle, keepStatus };
}

export async function refreshLinkedIssue(id: string, workspaceId?: string) {
  const existing = await db.query.linkedIssues.findFirst({
    where: workspaceId
      ? and(eq(linkedIssues.id, id), eq(linkedIssues.workspaceId, workspaceId))
      : eq(linkedIssues.id, id),
  });
  if (!existing) throw new Error("Linked issue not found");

  const siblings = await db.query.linkedIssues.findMany({
    where: and(
      eq(linkedIssues.provider, existing.provider),
      eq(linkedIssues.remoteId, existing.remoteId),
    ),
    columns: { id: true, title: true },
  });
  const siblingTitles = siblings
    .filter((row) => row.id !== existing.id)
    .map((row) => row.title);
  if (siblingTitles.some((title) => title !== existing.title)) {
    const [row] = await db
      .update(linkedIssues)
      .set({ lastSyncedAt: new Date(), updatedAt: new Date() })
      .where(
        workspaceId
          ? and(
              eq(linkedIssues.id, id),
              eq(linkedIssues.workspaceId, workspaceId),
            )
          : eq(linkedIssues.id, id),
      )
      .returning();
    return row ?? existing;
  }

  const provider = resolveIssueProvider({ provider: existing.provider });
  const remote = await provider.getIssue(existing.remoteId);
  const keep = refreshKeepsLocalFields({
    localRemoteId: existing.remoteId,
    localTitle: existing.title,
    localStatus: existing.remoteStatus,
    remoteId: remote.id,
    remoteTitle: remote.title,
    remoteStatus: remote.status,
    siblingTitles,
  });

  const values = toRowValues(remote, {
    workspaceId: existing.workspaceId,
    resultId: existing.resultId,
    caseId: existing.caseId,
    runId: existing.runId,
    createdById: existing.createdById,
    previousStatus: existing.remoteStatus,
  });

  if (keep.keepTitle) {
    values.title = existing.title;
    values.remoteKey = existing.remoteKey;
    values.url = existing.url;
    values.remoteId = existing.remoteId;
  }
  if (keep.keepStatus) {
    values.remoteStatus = existing.remoteStatus;
    values.needsRetest = existing.needsRetest;
  } else if (existing.needsRetest === 1) {
    values.needsRetest = 1;
  }

  const [row] = await db
    .update(linkedIssues)
    .set(values)
    .where(
      workspaceId
        ? and(eq(linkedIssues.id, id), eq(linkedIssues.workspaceId, workspaceId))
        : eq(linkedIssues.id, id),
    )
    .returning();

  return row;
}

export async function clearRetestFlag(id: string, workspaceId?: string) {
  const [row] = await db
    .update(linkedIssues)
    .set({ needsRetest: 0, updatedAt: new Date() })
    .where(
      workspaceId
        ? and(eq(linkedIssues.id, id), eq(linkedIssues.workspaceId, workspaceId))
        : eq(linkedIssues.id, id),
    )
    .returning();
  return row;
}

/**
 * Stub for limited provider sync: mark a linked issue closed locally so the
 * retest queue surfaces without waiting on a remote pull.
 */
export async function markIssueClosedLocally(id: string, workspaceId?: string) {
  const existing = await db.query.linkedIssues.findFirst({
    where: workspaceId
      ? and(eq(linkedIssues.id, id), eq(linkedIssues.workspaceId, workspaceId))
      : eq(linkedIssues.id, id),
  });
  if (!existing) throw new Error("Linked issue not found");

  const wasOpen = existing.remoteStatus !== "done";
  const [row] = await db
    .update(linkedIssues)
    .set({
      remoteStatus: "done",
      needsRetest: wasOpen || existing.needsRetest === 1 ? 1 : 0,
      lastSyncedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(
      workspaceId
        ? and(eq(linkedIssues.id, id), eq(linkedIssues.workspaceId, workspaceId))
        : eq(linkedIssues.id, id),
    )
    .returning();
  return row;
}

export async function listIssuesForRun(runId: string) {
  return db.query.linkedIssues.findMany({
    where: eq(linkedIssues.runId, runId),
  });
}

export async function listRetestQueue(workspaceId: string) {
  return db.query.linkedIssues.findMany({
    where: and(
      eq(linkedIssues.workspaceId, workspaceId),
      eq(linkedIssues.needsRetest, 1),
      eq(linkedIssues.remoteStatus, "done"),
    ),
    with: { case: true, run: true, result: true },
  });
}

export async function getScenarioContext(workspaceId: string, query: string) {
  const q = query.trim().toLowerCase();
  const allCases = await db.query.cases.findMany({
    where: eq(cases.workspaceId, workspaceId),
    limit: 200,
  });
  const matched = allCases.filter(
    (c) =>
      c.key.toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q) ||
      c.tags.some((t) => t.toLowerCase().includes(q)) ||
      c.description.toLowerCase().includes(q),
  );

  const caseIds = matched.map((c) => c.id);
  const recentResults = [];
  for (const caseId of caseIds.slice(0, 20)) {
    const rows = await db.query.runResults.findMany({
      where: eq(runResults.caseId, caseId),
      orderBy: [desc(runResults.executedAt)],
      limit: 5,
      with: { run: true },
    });
    recentResults.push(
      ...rows.filter((r) => r.run?.workspaceId === workspaceId),
    );
  }

  const openIssues = await db.query.linkedIssues.findMany({
    where: and(
      eq(linkedIssues.workspaceId, workspaceId),
      eq(linkedIssues.remoteStatus, "open"),
    ),
  });
  const relatedIssues = openIssues.filter(
    (i) => i.caseId && caseIds.includes(i.caseId),
  );

  const runsLatest = await db.query.runs.findMany({
    where: eq(runs.workspaceId, workspaceId),
    orderBy: [desc(runs.updatedAt)],
    limit: 5,
  });

  return {
    query,
    cases: matched.slice(0, 25),
    recentResults: recentResults.slice(0, 40).map((r) => ({
      id: r.id,
      status: r.status,
      notes: r.notes,
      caseId: r.caseId,
      runId: r.runId,
      runName: r.run?.name,
      executedAt: r.executedAt,
    })),
    openLinkedIssues: relatedIssues,
    latestRuns: runsLatest,
  };
}

/** Page size for agent pending lists. Totals are always returned with the page. */
export const PENDING_PAGE_LIMIT = 200;

export function disclosePendingPage<T>(rows: T[], total: number, limit: number) {
  const items = rows.slice(0, Math.max(0, limit));
  return {
    items,
    total,
    limit,
    truncated: total > items.length,
  };
}

/**
 * Pending failures are failed or blocked results with no linked issue.
 * Recording source (manual, CI, agent) is not a filter.
 */
export function selectFailuresWithoutIssue<
  T extends { id: string; status: string },
>(rows: T[], linkedResultIds: ReadonlySet<string>) {
  return rows.filter(
    (row) =>
      (row.status === "failed" || row.status === "blocked") &&
      !linkedResultIds.has(row.id),
  );
}

export function assemblePendingFailures<
  T extends { id: string; status: string },
>(
  failed: T[],
  failedTotal: number,
  blocked: T[],
  blockedTotal: number,
  linkedResultIds: ReadonlySet<string>,
  limit: number,
) {
  const failedPage = disclosePendingPage(
    selectFailuresWithoutIssue(failed, linkedResultIds),
    failedTotal,
    limit,
  );
  const blockedPage = disclosePendingPage(
    selectFailuresWithoutIssue(blocked, linkedResultIds),
    blockedTotal,
    limit,
  );
  return {
    failuresWithoutIssue: [...failedPage.items, ...blockedPage.items],
    failuresWithoutIssueTotal: failedTotal + blockedTotal,
    failuresWithoutIssueTruncated:
      failedPage.truncated || blockedPage.truncated,
  };
}

function resultStatusWhere(
  runIds: string[],
  status: "untested" | "failed" | "blocked",
  excludeResultIds: string[],
) {
  const filters = [
    eq(runResults.status, status),
    inArray(runResults.runId, runIds),
  ];
  if (excludeResultIds.length > 0) {
    filters.push(notInArray(runResults.id, excludeResultIds));
  }
  return and(...filters);
}

async function countResults(
  runIds: string[],
  status: "untested" | "failed" | "blocked",
  excludeResultIds: string[] = [],
) {
  if (runIds.length === 0) return 0;
  const [row] = await db
    .select({ value: count() })
    .from(runResults)
    .where(resultStatusWhere(runIds, status, excludeResultIds));
  return Number(row?.value ?? 0);
}

export async function whatsPending(workspaceId: string) {
  const workspaceRunIds = (
    await db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.workspaceId, workspaceId))
  ).map((r) => r.id);

  const linkedResultIds = (
    await db.query.linkedIssues.findMany({
      where: eq(linkedIssues.workspaceId, workspaceId),
      columns: { resultId: true },
    })
  )
    .map((i) => i.resultId)
    .filter((id): id is string => Boolean(id));
  const linked = new Set(linkedResultIds);

  const untested = workspaceRunIds.length
    ? await db.query.runResults.findMany({
        where: resultStatusWhere(workspaceRunIds, "untested", []),
        orderBy: [desc(runResults.createdAt)],
        limit: PENDING_PAGE_LIMIT,
        with: { case: true, run: true },
      })
    : [];
  const failed = workspaceRunIds.length
    ? await db.query.runResults.findMany({
        where: resultStatusWhere(workspaceRunIds, "failed", linkedResultIds),
        orderBy: [desc(runResults.createdAt)],
        limit: PENDING_PAGE_LIMIT,
      })
    : [];
  const blocked = workspaceRunIds.length
    ? await db.query.runResults.findMany({
        where: resultStatusWhere(workspaceRunIds, "blocked", linkedResultIds),
        orderBy: [desc(runResults.createdAt)],
        limit: PENDING_PAGE_LIMIT,
      })
    : [];
  const [untestedTotal, failedTotal, blockedTotal] = await Promise.all([
    countResults(workspaceRunIds, "untested"),
    countResults(workspaceRunIds, "failed", linkedResultIds),
    countResults(workspaceRunIds, "blocked", linkedResultIds),
  ]);

  const untestedPage = disclosePendingPage(
    untested,
    untestedTotal,
    PENDING_PAGE_LIMIT,
  );
  const failures = assemblePendingFailures(
    failed,
    failedTotal,
    blocked,
    blockedTotal,
    linked,
    PENDING_PAGE_LIMIT,
  );
  const retest = await listRetestQueue(workspaceId);
  const openIssues = await db.query.linkedIssues.findMany({
    where: and(
      eq(linkedIssues.workspaceId, workspaceId),
      eq(linkedIssues.remoteStatus, "open"),
    ),
    limit: 30,
  });

  return {
    untestedResults: untestedPage.items.map((r) => ({
      id: r.id,
      caseKey: r.case?.key,
      caseTitle: r.case?.title,
      runId: r.runId,
      runName: r.run?.name,
    })),
    untestedTotal: untestedPage.total,
    untestedLimit: untestedPage.limit,
    untestedTruncated: untestedPage.truncated,
    failuresWithoutIssue: failures.failuresWithoutIssue.map((r) => ({
      id: r.id,
      caseId: r.caseId,
      runId: r.runId,
      status: r.status,
      notes: r.notes,
    })),
    failuresWithoutIssueTotal: failures.failuresWithoutIssueTotal,
    failuresWithoutIssueTruncated: failures.failuresWithoutIssueTruncated,
    retestQueue: retest.map((i) => ({
      issueId: i.id,
      key: i.remoteKey,
      title: i.title,
      caseKey: i.case?.key,
      runId: i.runId,
      resultId: i.resultId,
    })),
    openLinkedIssues: openIssues,
  };
}
