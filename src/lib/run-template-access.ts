import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cases } from "@/db/schema";
import { requireWorkspaceAssignee } from "@/lib/assignee";
import type { RunTemplateInput } from "./run-template";
export async function validateTemplateReferences(workspaceId: string, input: RunTemplateInput) {
  const found = await db.select({ id: cases.id }).from(cases).where(and(eq(cases.workspaceId, workspaceId), inArray(cases.id, input.caseIds)));
  if (found.length !== input.caseIds.length) return "Some selected cases are unavailable. Update the selection before saving.";
  if (input.assigneeId) {
    const assignee = await requireWorkspaceAssignee(workspaceId, input.assigneeId, "runs.edit");
    if (!assignee.ok) return "The default assignee is unavailable. Choose another member.";
  }
  return null;
}
