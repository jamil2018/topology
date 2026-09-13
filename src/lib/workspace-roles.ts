import type { WorkspaceRole } from "@/db/schema";

export const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
};

export function canWrite(role: WorkspaceRole | null | undefined) {
  return role === "admin" || role === "member";
}

export function canAdmin(role: WorkspaceRole | null | undefined) {
  return role === "admin";
}

export function hasAtLeast(
  role: WorkspaceRole | null | undefined,
  required: WorkspaceRole,
) {
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[required];
}
