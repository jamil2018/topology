import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { workspaceMembers, type WorkspaceRole } from "@/db/schema";
import { membershipActions } from "@/lib/project";
import { roleHasAction, type Action } from "@/lib/permissions";

const assigneeIdSchema = z.string().uuid();

export type AssigneeDecision =
  | { ok: true }
  | { ok: false; status: 400 | 403; error: string };

export function parseAssigneeInput(
  value: unknown,
): { ok: true; assigneeId: string | null } | { ok: false; error: string } {
  if (value === null || value === "") {
    return { ok: true, assigneeId: null };
  }
  const parsed = assigneeIdSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: "Invalid assignee id" };
  }
  return { ok: true, assigneeId: parsed.data };
}

/**
 * Unknown ids and non-members are 400. Viewers (and any member whose
 * effective actions omit the required edit action) are 403.
 */
export function assigneeDecision(
  member: { role: WorkspaceRole; actions: readonly string[] } | null,
  requiredAction: Action,
): AssigneeDecision {
  if (!member) {
    return {
      ok: false,
      status: 400,
      error: "Assignee is not a member of this project",
    };
  }
  if (
    member.role === "viewer" ||
    !roleHasAction(member.actions, requiredAction)
  ) {
    return {
      ok: false,
      status: 403,
      error:
        member.role === "viewer"
          ? "Viewers cannot be assigned"
          : "Assignee does not have permission to be assigned",
    };
  }
  return { ok: true };
}

export async function requireWorkspaceAssignee(
  workspaceId: string,
  assigneeId: string,
  requiredAction: Action,
): Promise<AssigneeDecision> {
  const member = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspaceId),
      eq(workspaceMembers.userId, assigneeId),
    ),
    with: { customRole: true },
  });
  return assigneeDecision(
    member
      ? { role: member.role, actions: membershipActions(member) }
      : null,
    requiredAction,
  );
}
