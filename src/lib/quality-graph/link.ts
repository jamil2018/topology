import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { cases, testImplementations, testIntents } from "@/db/schema";
import type { QualityGraphDb } from "./ensure";

/**
 * Re-point an implementation (typically AUTO-* / junit) onto an existing intent.
 * Also updates the linked case.intentId when present.
 * Leaves the previous intent row in place (may become empty of implementations).
 */
export class LinkImplementationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LinkImplementationError";
    this.status = status;
  }
}

export async function linkImplementationToIntent(
  workspaceId: string,
  implementationId: string,
  targetIntentId: string,
  executor: QualityGraphDb = db,
): Promise<{
  implementationId: string;
  intentId: string;
  previousIntentId: string;
  caseId: string | null;
}> {
  const impl = await executor.query.testImplementations.findFirst({
    where: and(
      eq(testImplementations.id, implementationId),
      eq(testImplementations.workspaceId, workspaceId),
    ),
  });
  if (!impl) {
    throw new LinkImplementationError(404, "Implementation not found");
  }

  const target = await executor.query.testIntents.findFirst({
    where: and(
      eq(testIntents.id, targetIntentId),
      eq(testIntents.workspaceId, workspaceId),
    ),
  });
  if (!target) {
    throw new LinkImplementationError(404, "Intent not found");
  }

  if (impl.intentId === target.id) {
    return {
      implementationId: impl.id,
      intentId: target.id,
      previousIntentId: impl.intentId,
      caseId: impl.caseId ?? null,
    };
  }

  const previousIntentId = impl.intentId as string;

  await executor
    .update(testImplementations)
    .set({ intentId: target.id, updatedAt: new Date() })
    .where(eq(testImplementations.id, impl.id));

  if (impl.caseId) {
    await executor
      .update(cases)
      .set({ intentId: target.id, updatedAt: new Date() })
      .where(eq(cases.id, impl.caseId));
  }

  return {
    implementationId: impl.id,
    intentId: target.id,
    previousIntentId,
    caseId: impl.caseId ?? null,
  };
}

