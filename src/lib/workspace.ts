import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  users,
  workspaceMembers,
  workspaces,
  type WorkspaceRole,
} from "@/db/schema";
import { ensureSystemRoles, getSystemRole } from "@/lib/custom-roles";

export {
  ROLE_RANK,
  canAdmin,
  canWrite,
  hasAtLeast,
} from "./workspace-roles";

export async function ensureDefaultWorkspace() {
  const existing = await db.query.workspaces.findFirst({
    where: eq(workspaces.slug, "default"),
  });
  if (existing) {
    await ensureSystemRoles(existing.id);
    return existing;
  }

  const [created] = await db
    .insert(workspaces)
    .values({
      name: "Topology",
      slug: "default",
    })
    .returning();
  await ensureSystemRoles(created.id);
  return created;
}

/**
 * Load the caller's default-workspace membership and backfill a missing
 * system role id. Does not insert a membership unless `create` is set.
 * Signed-in users with no row stay non-members (403 at the access gate).
 * `create` is only for explicit bootstrap (seed, tests) — never a request path.
 */
export async function ensureMembership(
  userId: string,
  role: WorkspaceRole = "admin",
  options?: { create?: boolean },
) {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { id: true },
  });
  if (!user) {
    throw new Error(
      `Cannot join a workspace: user ${userId} does not exist. Sign in again.`,
    );
  }

  const workspace = await ensureDefaultWorkspace();
  const existing = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspace.id),
      eq(workspaceMembers.userId, userId),
    ),
  });
  if (existing) {
    if (!existing.customRoleId) {
      const systemRole = await getSystemRole(workspace.id, existing.role);
      const [updated] = await db
        .update(workspaceMembers)
        .set({ customRoleId: systemRole.id })
        .where(eq(workspaceMembers.id, existing.id))
        .returning();
      return { workspace, membership: updated ?? existing };
    }
    return { workspace, membership: existing };
  }

  if (!options?.create) {
    return { workspace, membership: null };
  }

  const systemRole = await getSystemRole(workspace.id, role);
  const [membership] = await db
    .insert(workspaceMembers)
    .values({
      workspaceId: workspace.id,
      userId,
      role,
      customRoleId: systemRole.id,
    })
    .returning();
  return { workspace, membership };
}

/** Membership for a specific project, or the default workspace when omitted. */
export async function getMembership(userId: string, projectId?: string) {
  const workspace = projectId
    ? await db.query.workspaces.findFirst({
        where: eq(workspaces.id, projectId),
      })
    : await ensureDefaultWorkspace();

  if (!workspace) {
    return { workspace: null, membership: null };
  }

  const membership = await db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, workspace.id),
      eq(workspaceMembers.userId, userId),
    ),
    with: { user: true, workspace: true, customRole: true },
  });
  return { workspace, membership };
}
