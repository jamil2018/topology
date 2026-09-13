import { and, asc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import {
  workspaceRoles,
  type WorkspaceCustomRole,
  type WorkspaceRole,
} from "@/db/schema";
import {
  normalizeActions,
  SYSTEM_ROLE_ACTIONS,
  SYSTEM_ROLE_META,
  type Action,
} from "@/lib/permissions";

export async function ensureSystemRoles(
  workspaceId: string,
): Promise<Record<WorkspaceRole, WorkspaceCustomRole>> {
  const existing = await db.query.workspaceRoles.findMany({
    where: and(
      eq(workspaceRoles.workspaceId, workspaceId),
      eq(workspaceRoles.isSystem, true),
    ),
  });

  const byKey = new Map(
    existing
      .filter((r) => r.systemKey != null)
      .map((r) => [r.systemKey as WorkspaceRole, r]),
  );

  for (const key of ["admin", "member", "viewer"] as const) {
    if (byKey.has(key)) continue;
    const meta = SYSTEM_ROLE_META[key];
    const [created] = await db
      .insert(workspaceRoles)
      .values({
        workspaceId,
        name: meta.name,
        description: meta.description,
        actions: [...SYSTEM_ROLE_ACTIONS[key]],
        isSystem: true,
        systemKey: key,
      })
      .onConflictDoNothing()
      .returning();
    if (created) {
      byKey.set(key, created);
      continue;
    }
    const again = await db.query.workspaceRoles.findFirst({
      where: and(
        eq(workspaceRoles.workspaceId, workspaceId),
        eq(workspaceRoles.systemKey, key),
      ),
    });
    if (again) byKey.set(key, again);
  }

  const admin = byKey.get("admin");
  const member = byKey.get("member");
  const viewer = byKey.get("viewer");
  if (!admin || !member || !viewer) {
    throw new Error(`Failed to ensure system roles for workspace ${workspaceId}`);
  }
  return { admin, member, viewer };
}

export async function getSystemRole(
  workspaceId: string,
  systemKey: WorkspaceRole,
) {
  const roles = await ensureSystemRoles(workspaceId);
  return roles[systemKey];
}

export async function listProjectRoles(
  workspaceId: string,
  options?: { includeArchived?: boolean },
) {
  await ensureSystemRoles(workspaceId);
  const rows = await db.query.workspaceRoles.findMany({
    where: eq(workspaceRoles.workspaceId, workspaceId),
    orderBy: [asc(workspaceRoles.isSystem), asc(workspaceRoles.name)],
  });
  if (options?.includeArchived) return rows;
  return rows.filter((r) => r.archivedAt == null);
}

export async function getRoleActions(
  role: WorkspaceCustomRole | null | undefined,
  fallback: WorkspaceRole | null | undefined,
): Promise<Action[]> {
  if (role?.actions?.length) {
    return normalizeActions(role.actions);
  }
  if (fallback) return [...SYSTEM_ROLE_ACTIONS[fallback]];
  return [];
}

export async function findActiveRole(
  workspaceId: string,
  roleId: string,
) {
  return db.query.workspaceRoles.findFirst({
    where: and(
      eq(workspaceRoles.id, roleId),
      eq(workspaceRoles.workspaceId, workspaceId),
      isNull(workspaceRoles.archivedAt),
    ),
  });
}
