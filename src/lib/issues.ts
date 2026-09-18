import { and, desc, eq, inArray } from "drizzle-orm";
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
}) {
  const result = await db.query.runResults.findFirst({
    where: eq(runResults.id, input.resultId),
    with: { case: true, run: true },
  });
  if (!result) throw new Error("Result not found");
  if (result.status !== "failed" && result.status !== "blocked") {
    throw new Error("Issues can only be filed from failed or blocked results");
  }

  const workspaceId = result.run?.workspaceId ?? result.case?.workspaceId;
  if (!workspaceId) throw new Error("Result is missing workspace scope");

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
}) {
  const result = await db.query.runResults.findFirst({
    where: eq(runResults.id, input.resultId),
    with: { case: true, run: true },
  });
  if (!result) throw new Error("Result not found");

  const workspaceId = result.run?.workspaceId ?? result.case?.workspaceId;
  if (!workspaceId) throw new Error("Result is missing workspace scope");

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

export async function refreshLinkedIssue(id: string) {
  const existing = await db.query.linkedIssues.findFirst({
    where: eq(linkedIssues.id, id),
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
      .where(eq(linkedIssues.id, id))
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
    .where(eq(linkedIssues.id, id))
    .returning();

  return row;
}

export async function clearRetestFlag(id: string) {
  const [row] = await db
    .update(linkedIssues)
    .set({ needsRetest: 0, updatedAt: new Date() })
    .where(eq(linkedIssues.id, id))
    .returning();
  return row;
}

/**
 * Stub for limited provider sync: mark a linked issue closed locally so the
 * retest queue surfaces without waiting on a remote pull.
 */
export async function markIssueClosedLocally(id: string) {
  const existing = await db.query.linkedIssues.findFirst({
    where: eq(linkedIssues.id, id),
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
    .where(eq(linkedIssues.id, id))
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

export async function whatsPending(workspaceId: string) {
  const workspaceRunIds = (
    await db
      .select({ id: runs.id })
      .from(runs)
      .where(eq(runs.workspaceId, workspaceId))
  ).map((r) => r.id);

  const untested =
    workspaceRunIds.length === 0
      ? []
      : await db.query.runResults.findMany({
          where: and(
            eq(runResults.status, "untested"),
            inArray(runResults.runId, workspaceRunIds),
          ),
          limit: 50,
          with: { case: true, run: true },
        });

  const failures =
    workspaceRunIds.length === 0
      ? []
      : await db.query.runResults.findMany({
          where: and(
            eq(runResults.status, "failed"),
            inArray(runResults.runId, workspaceRunIds),
          ),
          limit: 50,
        });

  const blocked =
    workspaceRunIds.length === 0
      ? []
      : await db.query.runResults.findMany({
          where: and(
            eq(runResults.status, "blocked"),
            inArray(runResults.runId, workspaceRunIds),
          ),
          limit: 50,
        });

  const linkedResultIds = new Set(
    (
      await db.query.linkedIssues.findMany({
        where: eq(linkedIssues.workspaceId, workspaceId),
      })
    )
      .map((i) => i.resultId)
      .filter(Boolean),
  );

  const triage = [...failures, ...blocked].filter(
    (r) => !linkedResultIds.has(r.id),
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
    untestedResults: untested.map((r) => ({
      id: r.id,
      caseKey: r.case?.key,
      caseTitle: r.case?.title,
      runId: r.runId,
      runName: r.run?.name,
    })),
    failuresWithoutIssue: triage.slice(0, 30).map((r) => ({
      id: r.id,
      caseId: r.caseId,
      runId: r.runId,
      status: r.status,
      notes: r.notes,
    })),
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
