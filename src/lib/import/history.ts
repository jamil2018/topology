import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { attachments, auditEvents, caseImportSources, cases, runResults, runs, vendorRunHistory } from "@/db/schema";
import { inferAttachmentKind, storeAttachmentFile } from "@/lib/attachments";
import type { HistoricalRun, HistoryBundle } from "./history-format";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type HistoryScope = {
  workspaceId: string;
  actorId: string;
  provider: HistoryBundle["provider"];
  namespace: string;
};

export type HistoryRunPreview = {
  sourceId: string;
  name: string;
  state: "ready" | "imported" | "unchanged" | "conflict" | "failed";
  resultCount: number;
  attachmentCount: number;
  unmapped: string[];
  ambiguous: string[];
  href?: string;
  reason?: string;
};

function historyIdentity(scope: HistoryScope, sourceId: string) {
  return and(
    eq(vendorRunHistory.workspaceId, scope.workspaceId),
    eq(vendorRunHistory.provider, scope.provider),
    eq(vendorRunHistory.namespace, scope.namespace),
    eq(vendorRunHistory.sourceRunId, sourceId),
  );
}

function sourceKeys(scope: HistoryScope, caseSourceId: string) {
  if (scope.provider !== "testrail" || !/^C?\d+$/i.test(caseSourceId)) return [caseSourceId];
  const digits = caseSourceId.replace(/^C/i, "");
  return [digits, `C${digits}`];
}

async function readMatches(executor: Pick<typeof db, "select">, scope: HistoryScope, historical: HistoricalRun) {
  const sourceIds = [...new Set(historical.results.map((result) => result.caseSourceId))];
  const keys = [...new Set(sourceIds.flatMap((id) => sourceKeys(scope, id)))];
  const rows = keys.length ? await executor.select({
    sourceId: caseImportSources.sourceId, id: cases.id, title: cases.title, key: cases.key,
  }).from(caseImportSources).innerJoin(cases, and(
    eq(cases.id, caseImportSources.caseId), eq(cases.workspaceId, scope.workspaceId),
  )).where(and(
    eq(caseImportSources.workspaceId, scope.workspaceId), eq(caseImportSources.provider, scope.provider),
    eq(caseImportSources.namespace, scope.namespace), inArray(caseImportSources.sourceId, keys),
  )) : [];
  const bySource = new Map(rows.map((row) => [row.sourceId, row]));
  const selected = new Map<string, (typeof rows)[number]>();
  const unmapped: string[] = [];
  const ambiguous: string[] = [];
  for (const id of sourceIds) {
    const matches = sourceKeys(scope, id).flatMap((key) => {
      const match = bySource.get(key);
      return match ? [match] : [];
    });
    if (new Set(matches.map((match) => match.id)).size > 1) ambiguous.push(id);
    else if (matches.length === 0) unmapped.push(id);
    else selected.set(id, matches[0]);
  }
  return { selected, unmapped, ambiguous };
}

async function inspectRun(executor: Pick<typeof db, "select" | "query">, scope: HistoryScope, run: HistoricalRun, digest: string) {
  const [matches, prior] = await Promise.all([
    readMatches(executor, scope, run),
    executor.query.vendorRunHistory.findFirst({ where: historyIdentity(scope, run.id) }),
  ]);
  const preview: HistoryRunPreview = {
    sourceId: run.id, name: run.name, state: "ready",
    resultCount: run.results.length, attachmentCount: run.attachments.length,
    unmapped: matches.unmapped, ambiguous: matches.ambiguous,
  };
  if (prior?.runId && prior.digest === digest) {
    return { matches, preview: { ...preview, state: "unchanged" as const, href: `/runs/${prior.runId}` } };
  }
  if (prior) {
    return { matches, preview: {
      ...preview, state: "conflict" as const,
      reason: prior.runId ? "A different snapshot was already imported for this source run." : "An earlier import of this source run was deleted.",
    } };
  }
  return { matches, preview };
}

export async function previewHistoricalRun(scope: HistoryScope, run: HistoricalRun, digest: string) {
  return (await inspectRun(db, scope, run, digest)).preview;
}

function stableId(parts: string[]) {
  return createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

function asDate(raw?: string | null) {
  return raw ? new Date(raw) : null;
}

async function importRun(tx: Tx, scope: HistoryScope, historical: HistoricalRun, digest: string): Promise<HistoryRunPreview> {
  const identity = [scope.workspaceId, scope.provider, scope.namespace, historical.id];
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify(identity)}, 0))`);
  const { matches, preview } = await inspectRun(tx, scope, historical, digest);
  if (preview.state !== "ready") return preview;

  const completedAt = new Date(historical.completedAt);
  const startedAt = asDate(historical.startedAt);
  const [run] = await tx.insert(runs).values({
    workspaceId: scope.workspaceId, name: historical.name, description: historical.description ?? "",
    status: "completed", kind: "manual", environment: historical.environment ?? "imported",
    source: `import:${scope.provider}`, externalId: historical.id,
    startedAt, completedAt, createdAt: startedAt ?? completedAt, updatedAt: completedAt,
    createdById: scope.actorId,
  }).returning({ id: runs.id });

  const resultIds = new Map<string, string>();
  const iterations = new Map<string, number>();
  const batchSize = 250;
  for (let offset = 0; offset < historical.results.length; offset += batchSize) {
    const batch = historical.results.slice(offset, offset + batchSize);
    const saved = await tx.insert(runResults).values(batch.map((result) => {
      const linked = matches.selected.get(result.caseSourceId);
      const title = result.title || linked?.title || `Source case ${result.caseSourceId}`;
      const iterationIndex = iterations.get(result.caseSourceId) ?? 0;
      iterations.set(result.caseSourceId, iterationIndex + 1);
      const executedAt = asDate(result.executedAt);
      return {
        runId: run.id, caseId: linked?.id ?? null, externalKey: result.sourceId,
        title, status: result.status, notes: result.notes ?? "", stack: result.stack,
        durationMs: result.durationMs, executedAt, createdAt: executedAt ?? completedAt, iterationIndex,
        environmentJson: JSON.stringify({ history: { caseSourceId: result.caseSourceId, sourceStatus: result.sourceStatus } }),
        caseSnapshot: linked ? { id: linked.id, key: linked.key, title, steps: "", expectedResult: "" } : null,
      };
    })).returning({ id: runResults.id, externalKey: runResults.externalKey });
    for (const row of saved) resultIds.set(row.externalKey!, row.id);
  }

  for (const attachment of historical.attachments) {
    const key = stableId([...identity, digest, attachment.resultId, attachment.id]);
    const file = new File([new Uint8Array(Buffer.from(attachment.dataBase64!, "base64"))],
      attachment.filename, { type: attachment.contentType });
    const stored = await storeAttachmentFile(file, key);
    await tx.insert(attachments).values({
      ...stored, resultId: resultIds.get(attachment.resultId)!, uploadedById: scope.actorId,
      kind: inferAttachmentKind(stored.filename, stored.contentType),
    });
  }

  await tx.insert(vendorRunHistory).values({
    workspaceId: scope.workspaceId, provider: scope.provider, namespace: scope.namespace,
    sourceRunId: historical.id, digest, runId: run.id,
  });
  await tx.insert(auditEvents).values({
    workspaceId: scope.workspaceId, actorId: scope.actorId, action: "import.history",
    targetType: "run", targetId: run.id, metadataJson: JSON.stringify({
      provider: scope.provider, namespace: scope.namespace, sourceRunId: historical.id,
      resultCount: historical.results.length, attachmentCount: historical.attachments.length,
      unmapped: matches.unmapped.length, ambiguous: matches.ambiguous.length,
    }),
  });
  return { ...preview, state: "imported", href: `/runs/${run.id}` };
}

export async function applyHistoricalRun(scope: HistoryScope, run: HistoricalRun, digest: string): Promise<HistoryRunPreview> {
  try {
    return await db.transaction((tx) => importRun(tx, scope, run, digest));
  } catch {
    return {
      sourceId: run.id, name: run.name, state: "failed",
      resultCount: run.results.length, attachmentCount: run.attachments.length, unmapped: [], ambiguous: [],
      reason: "Failed to save this run. Retry the same file to resume.",
    };
  }
}
