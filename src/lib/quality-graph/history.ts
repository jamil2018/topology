import { and, desc, eq, inArray, isNotNull, ne, or } from "drizzle-orm";
import { db } from "@/db";
import {
  attachments,
  failureSignatures,
  runResults,
  testImplementations,
  triageItems,
} from "@/db/schema";
import { getIntentDetail } from "./intents";

export type ExecutionHistoryEntry = {
  id: string;
  runId: string;
  runName: string | null;
  caseId: string | null;
  caseKey: string | null;
  implementationId: string | null;
  externalKey: string | null;
  status: string;
  notes: string;
  errorMessage: string | null;
  executedAt: Date | null;
  durationMs: number | null;
};

export async function getExecutionHistory(
  workspaceId: string,
  opts: {
    intentId?: string;
    intentKey?: string;
    implementationId?: string;
    limit?: number;
  },
): Promise<{ results: ExecutionHistoryEntry[] }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let implementationIds: string[] = [];
  let caseIds: string[] = [];

  if (opts.implementationId) {
    const impl = await db.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.id, opts.implementationId),
        eq(testImplementations.workspaceId, workspaceId),
      ),
    });
    if (!impl) {
      return { results: [] };
    }
    implementationIds = [impl.id];
    if (impl.caseId) caseIds = [impl.caseId];
  } else {
    const intentRef = opts.intentId ?? opts.intentKey;
    if (!intentRef) {
      return { results: [] };
    }
    const intent = await getIntentDetail(workspaceId, intentRef);
    if (!intent) {
      return { results: [] };
    }
    implementationIds = intent.implementations.map((i) => i.id);
    caseIds = intent.cases.map((c) => c.id);
    if (implementationIds.length === 0 && caseIds.length === 0) {
      return { results: [] };
    }
  }

  const predicates = [];
  if (implementationIds.length > 0) {
    predicates.push(inArray(runResults.implementationId, implementationIds));
  }
  if (caseIds.length > 0) {
    predicates.push(inArray(runResults.caseId, caseIds));
  }
  const scopeFilter =
    predicates.length === 1 ? predicates[0]! : or(...predicates);

  const rows = await db.query.runResults.findMany({
    where: and(
      scopeFilter,
      ne(runResults.status, "untested"),
      isNotNull(runResults.executedAt),
    ),
    with: {
      run: true,
      case: true,
      implementation: true,
    },
    orderBy: [desc(runResults.executedAt)],
    limit: limit * 3,
  });

  const scoped = rows
    .filter((r) => r.run?.workspaceId === workspaceId)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      runId: r.runId,
      runName: r.run?.name ?? null,
      caseId: r.caseId,
      caseKey: r.case?.key ?? null,
      implementationId: r.implementationId,
      externalKey: r.externalKey ?? r.implementation?.externalKey ?? null,
      status: r.status,
      notes: r.notes,
      errorMessage: r.errorMessage,
      executedAt: r.executedAt,
      durationMs: r.durationMs,
    }));

  return { results: scoped };
}

function attachmentSummary(rows: typeof attachments.$inferSelect[]) {
  return rows.map((a) => ({
    id: a.id,
    kind: a.kind,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
  }));
}

function signaturePayload(sig: typeof failureSignatures.$inferSelect | null) {
  if (!sig) return null;
  return {
    id: sig.id,
    hash: sig.hash,
    normalizedMessage: sig.normalizedMessage,
    stackTop: sig.stackTop,
    occurrenceCount: sig.occurrenceCount,
    lastSeenAt: sig.lastSeenAt,
  };
}

export async function getFailureEvidence(
  workspaceId: string,
  opts: { resultId?: string; signatureId?: string },
) {
  if (opts.resultId) {
    const result = await db.query.runResults.findFirst({
      where: eq(runResults.id, opts.resultId),
      with: {
        run: true,
        attachments: true,
      },
    });
    if (!result?.run || result.run.workspaceId !== workspaceId) {
      return null;
    }

    const triage = await db.query.triageItems.findFirst({
      where: eq(triageItems.resultId, result.id),
    });
    let signature: typeof failureSignatures.$inferSelect | null = null;
    if (triage?.signatureId) {
      signature =
        (await db.query.failureSignatures.findFirst({
          where: and(
            eq(failureSignatures.id, triage.signatureId),
            eq(failureSignatures.workspaceId, workspaceId),
          ),
        })) ?? null;
    }

    return {
      resultId: result.id,
      notes: result.notes,
      errorMessage: result.errorMessage,
      stack: result.stack,
      attachments: attachmentSummary(result.attachments),
      signature: signaturePayload(signature),
    };
  }

  if (opts.signatureId) {
    const signature = await db.query.failureSignatures.findFirst({
      where: and(
        eq(failureSignatures.id, opts.signatureId),
        eq(failureSignatures.workspaceId, workspaceId),
      ),
    });
    if (!signature) return null;

    const triage = await db.query.triageItems.findFirst({
      where: and(
        eq(triageItems.workspaceId, workspaceId),
        eq(triageItems.signatureId, signature.id),
      ),
      orderBy: [desc(triageItems.lastSeenAt)],
    });

    let result = triage?.resultId
      ? await db.query.runResults.findFirst({
          where: eq(runResults.id, triage.resultId),
          with: { attachments: true, run: true },
        })
      : null;

    if (result?.run && result.run.workspaceId !== workspaceId) {
      result = null;
    }

    return {
      resultId: result?.id ?? null,
      notes: result?.notes ?? triage?.notes ?? "",
      errorMessage: result?.errorMessage ?? null,
      stack: result?.stack ?? null,
      attachments: attachmentSummary(result?.attachments ?? []),
      signature: signaturePayload(signature),
    };
  }

  return null;
}

