import { and, eq } from "drizzle-orm";
import {
  computeFailureSignature,
  type FailureSignatureInput,
} from "@topology/domain";
import { db } from "@/db";
import { failureSignatures } from "@/db/schema";

type PersistDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: any;
};

/**
 * Upsert a failure_signatures row for the normalized message + stack top.
 * Increments occurrenceCount and refreshes lastSeenAt on repeat.
 */
export async function upsertFailureSignature(
  workspaceId: string,
  input: FailureSignatureInput,
  executor: PersistDb = db,
): Promise<{ id: string; hash: string; created: boolean }> {
  const signature = computeFailureSignature(input);

  const existing = await executor.query.failureSignatures.findFirst({
    where: and(
      eq(failureSignatures.workspaceId, workspaceId),
      eq(failureSignatures.hash, signature.hash),
    ),
  });

  if (existing) {
    await executor
      .update(failureSignatures)
      .set({
        occurrenceCount: existing.occurrenceCount + 1,
        lastSeenAt: new Date(),
        normalizedMessage:
          signature.normalizedMessage || existing.normalizedMessage,
        stackTop: signature.stackTop || existing.stackTop,
      })
      .where(eq(failureSignatures.id, existing.id));
    return { id: existing.id, hash: signature.hash, created: false };
  }

  const [created] = await executor
    .insert(failureSignatures)
    .values({
      workspaceId,
      hash: signature.hash,
      normalizedMessage: signature.normalizedMessage,
      stackTop: signature.stackTop,
      occurrenceCount: 1,
    })
    .returning({ id: failureSignatures.id });

  if (!created) {
    // Race: another writer inserted the same hash.
    const raced = await executor.query.failureSignatures.findFirst({
      where: and(
        eq(failureSignatures.workspaceId, workspaceId),
        eq(failureSignatures.hash, signature.hash),
      ),
    });
    if (!raced) {
      throw new Error("Failed to upsert failure signature");
    }
    await executor
      .update(failureSignatures)
      .set({
        occurrenceCount: raced.occurrenceCount + 1,
        lastSeenAt: new Date(),
      })
      .where(eq(failureSignatures.id, raced.id));
    return { id: raced.id, hash: signature.hash, created: false };
  }

  return { id: created.id, hash: signature.hash, created: true };
}
