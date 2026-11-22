import { and, eq, inArray } from "drizzle-orm";
import type { db } from "@/db";
import { cases, workspaces } from "@/db/schema";

export type CaseReviewTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockCaseReviewPolicy(
  tx: CaseReviewTransaction,
  workspaceId: string,
  lock: "share" | "no key update" = "share",
) {
  const [policy] = await tx.select({ required: workspaces.requireCaseReview })
    .from(workspaces).where(eq(workspaces.id, workspaceId)).for(lock);
  return policy?.required ?? false;
}

export const protectedCase = (workspaceId: string) => and(
  eq(cases.workspaceId, workspaceId), inArray(cases.status, ["ready", "in_review"]),
);

export async function allCasesReady(tx: CaseReviewTransaction, workspaceId: string, caseIds: readonly string[]) {
  if (!caseIds.length) return true;
  const ready = await tx.select({ id: cases.id }).from(cases).where(and(
    eq(cases.workspaceId, workspaceId), eq(cases.status, "ready"), inArray(cases.id, caseIds),
  )).for("share");
  return ready.length === caseIds.length;
}

export function importedCaseStatus<T extends string>(status: T, requireReview: boolean): T | "draft" {
  return requireReview && (status === "ready" || status === "in_review") ? "draft" : status;
}

export const caseReviewRequired = {
  code: "CASE_REVIEW_REQUIRED",
  error: "Submit the case for review before marking it ready.",
};
