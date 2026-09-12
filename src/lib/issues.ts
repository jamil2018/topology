import { and, desc, eq } from "drizzle-orm";
import {
  buildFailureIssueBody,
  resolveIssueProvider,
  type IssueProviderId,
  type RemoteIssue,
} from "@topology/issue-providers";
import { db } from "@/db";
import { linkedIssues, runResults, runs } from "@/db/schema";

export type LinkedIssueRow = typeof linkedIssues.$inferSelect;

function toRowValues(
  remote: RemoteIssue,
  meta: {
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
        resultId: result.id,
        caseId: result.caseId,
        runId: result.runId,
        createdById: input.userId,
      }),
    )
    .returning();

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

  const provider = resolveIssueProvider({ provider: input.provider });
  const remote = await provider.linkExisting(input.remoteKey);

  const [row] = await db
    .insert(linkedIssues)
    .values(
      toRowValues(remote, {
        resultId: result.id,
        caseId: result.caseId,
        runId: result.runId,
        createdById: input.userId,
      }),
    )
    .returning();

  return row;
}

export async function refreshLinkedIssue(id: string) {
  const existing = await db.query.linkedIssues.findFirst({
    where: eq(linkedIssues.id, id),
  });
  if (!existing) throw new Error("Linked issue not found");

  const provider = resolveIssueProvider({ provider: existing.provider });
  const remote = await provider.getIssue(existing.remoteId);

  const values = toRowValues(remote, {
    resultId: existing.resultId,
    caseId: existing.caseId,
    runId: existing.runId,
    createdById: existing.createdById,
    previousStatus: existing.remoteStatus,
  });

  if (existing.needsRetest === 1) {
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

export async function listIssuesForRun(runId: string) {
  return db.query.linkedIssues.findMany({
    where: eq(linkedIssues.runId, runId),
  });
}

export async function listRetestQueue() {
  return db.query.linkedIssues.findMany({
    where: and(
      eq(linkedIssues.needsRetest, 1),
      eq(linkedIssues.remoteStatus, "done"),
    ),
    with: { case: true, run: true, result: true },
  });
}

export async function getScenarioContext(query: string) {
  const q = query.trim().toLowerCase();
  const allCases = await db.query.cases.findMany({ limit: 200 });
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
    recentResults.push(...rows);
  }

  const openIssues = await db.query.linkedIssues.findMany({
    where: eq(linkedIssues.remoteStatus, "open"),
  });
  const relatedIssues = openIssues.filter(
    (i) => i.caseId && caseIds.includes(i.caseId),
  );

  const runsLatest = await db.query.runs.findMany({
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

export async function whatsPending() {
  const untested = await db.query.runResults.findMany({
    where: eq(runResults.status, "untested"),
    limit: 50,
    with: { case: true, run: true },
  });

  const failures = await db.query.runResults.findMany({
    where: eq(runResults.status, "failed"),
    limit: 50,
  });

  const blocked = await db.query.runResults.findMany({
    where: eq(runResults.status, "blocked"),
    limit: 50,
  });

  const linkedResultIds = new Set(
    (await db.query.linkedIssues.findMany())
      .map((i) => i.resultId)
      .filter(Boolean),
  );

  const triage = [...failures, ...blocked].filter(
    (r) => !linkedResultIds.has(r.id),
  );
  const retest = await listRetestQueue();
  const openIssues = await db.query.linkedIssues.findMany({
    where: eq(linkedIssues.remoteStatus, "open"),
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
