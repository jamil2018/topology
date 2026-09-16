import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  workspaceMembers,
  workspaces,
  type Workspace,
  type WorkspaceCustomRole,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/db/schema";
import { ensureSystemRoles, getSystemRole } from "@/lib/custom-roles";
import {
  SYSTEM_ROLE_ACTIONS,
  actionsAllowAdmin,
  actionsAllowWrite,
  denyMessage,
  normalizeActions,
  roleHasAction,
  type Action,
} from "@/lib/permissions";
import {
  canAdmin,
  canWrite,
  ensureDefaultWorkspace,
  ensureMembership,
} from "@/lib/workspace";

/** Cookie + header key for the active Topology project (workspace). */
export const PROJECT_COOKIE = "topology_project_id";
export const PROJECT_HEADER = "x-topology-project-id";

export type ProjectSummary = {
  id: string;
  name: string;
  slug: string;
  archivedAt: Date | null;
  role: WorkspaceRole;
};

export type MembershipWithRole = WorkspaceMember & {
  customRole?: WorkspaceCustomRole | null;
  workspace?: Workspace | null;
  user?: unknown;
};

export type ActiveProjectContext = {
  project: Workspace;
  membership: MembershipWithRole;
  projects: ProjectSummary[];
  actions: Action[];
};

function toSummary(
  workspace: Workspace,
  role: WorkspaceRole,
): ProjectSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    archivedAt: workspace.archivedAt,
    role,
  };
}

/**
 * Prefer a project the user can already access. An unknown or foreign id
 * falls back to the first accessible project — never a project they do not
 * belong to.
 */
export function pickAccessibleProject<T extends { id: string }>(
  projects: T[],
  preferredId?: string | null,
): T | undefined {
  if (projects.length === 0) return undefined;
  if (preferredId) {
    const match = projects.find((project) => project.id === preferredId);
    if (match) return match;
  }
  return projects[0];
}

/** Resolve effective actions for a membership (custom role or legacy enum). */
export function membershipActions(membership: MembershipWithRole): Action[] {
  if (membership.customRole?.actions?.length) {
    return normalizeActions(membership.customRole.actions);
  }
  return [...SYSTEM_ROLE_ACTIONS[membership.role]];
}

export function ctxHasAction(ctx: ActiveProjectContext, action: Action) {
  return roleHasAction(ctx.actions, action);
}

export function ctxCanWrite(ctx: ActiveProjectContext) {
  return actionsAllowWrite(ctx.actions) || canWrite(ctx.membership.role);
}

export function ctxCanAdmin(ctx: ActiveProjectContext) {
  return actionsAllowAdmin(ctx.actions) || canAdmin(ctx.membership.role);
}

export async function listUserProjects(
  userId: string,
  options?: { includeArchived?: boolean },
): Promise<ProjectSummary[]> {
  const rows = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.userId, userId),
    with: { workspace: true },
    orderBy: [asc(workspaceMembers.createdAt)],
  });

  return rows
    .filter((row) => {
      if (!row.workspace) return false;
      if (options?.includeArchived) return true;
      return row.workspace.archivedAt == null;
    })
    .map((row) => toSummary(row.workspace, row.role));
}

export async function getMembershipForProject(
  userId: string,
  projectId: string,
) {
  return db.query.workspaceMembers.findFirst({
    where: and(
      eq(workspaceMembers.workspaceId, projectId),
      eq(workspaceMembers.userId, userId),
    ),
    with: { workspace: true, user: true, customRole: true },
  });
}

export async function readPreferredProjectId(
  request?: Request | null,
): Promise<string | null> {
  const fromHeader = request?.headers.get(PROJECT_HEADER)?.trim();
  if (fromHeader) return fromHeader;

  try {
    const jar = await cookies();
    return jar.get(PROJECT_COOKIE)?.value ?? null;
  } catch {
    return null;
  }
}

function withActions(
  project: Workspace,
  membership: MembershipWithRole,
  projects: ProjectSummary[],
): ActiveProjectContext {
  return {
    project,
    membership,
    projects,
    actions: membershipActions(membership),
  };
}

/**
 * Resolve the active project for a user.
 * Preference order: preferredId → first accessible → ensure default.
 */
export async function resolveActiveProject(
  userId: string,
  preferredId?: string | null,
): Promise<ActiveProjectContext | null> {
  // Omitted preference reads the active-project cookie. An explicit null
  // means "no preference" (the caller already checked the cookie/header).
  const preferred =
    preferredId !== undefined ? preferredId : await readPreferredProjectId();

  let projects = await listUserProjects(userId);
  if (projects.length === 0) {
    await ensureMembership(userId, "admin");
    projects = await listUserProjects(userId);
  }
  if (projects.length === 0) return null;

  const pick = pickAccessibleProject(projects, preferred);
  if (!pick) return null;

  const membership = await getMembershipForProject(userId, pick.id);
  if (!membership?.workspace) return null;

  return withActions(membership.workspace, membership, projects);
}

function checkAccessOptions(
  ctx: ActiveProjectContext,
  options?: {
    write?: boolean;
    admin?: boolean;
    action?: Action;
  },
): { ok: true } | { ok: false; status: number; error: string } {
  if (options?.action && !ctxHasAction(ctx, options.action)) {
    return { ok: false, status: 403, error: denyMessage(options.action) };
  }
  if (options?.admin && !ctxCanAdmin(ctx)) {
    return { ok: false, status: 403, error: "Admin role required" };
  }
  if (options?.write && !ctxCanWrite(ctx)) {
    return { ok: false, status: 403, error: "Write access required" };
  }
  return { ok: true };
}

export async function requireProjectAccess(
  userId: string,
  options?: {
    preferredId?: string | null;
    request?: Request | null;
    write?: boolean;
    admin?: boolean;
    /** Fine-grained action check (preferred over write/admin when known). */
    action?: Action;
    /** Allow resolving an archived project (admin manage flows). */
    allowArchived?: boolean;
  },
): Promise<
  | { ok: true; ctx: ActiveProjectContext }
  | { ok: false; status: number; error: string }
> {
  const preferred =
    options?.preferredId ?? (await readPreferredProjectId(options?.request));

  if (options?.allowArchived && preferred) {
    const membership = await getMembershipForProject(userId, preferred);
    if (membership?.workspace) {
      const projects = await listUserProjects(userId, {
        includeArchived: true,
      });
      const ctx = withActions(membership.workspace, membership, projects);
      const gate = checkAccessOptions(ctx, options);
      if (!gate.ok) return gate;
      return { ok: true, ctx };
    }
  }

  const ctx = await resolveActiveProject(userId, preferred);
  if (!ctx) {
    return { ok: false, status: 403, error: "No accessible project" };
  }
  if (ctx.project.archivedAt && !options?.allowArchived) {
    return { ok: false, status: 403, error: "Project is archived" };
  }
  const gate = checkAccessOptions(ctx, options);
  if (!gate.ok) return gate;
  return { ok: true, ctx };
}

export function slugifyProjectName(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "project";
}

export async function createProject(input: {
  name: string;
  slug?: string;
  creatorUserId: string;
}): Promise<Workspace> {
  const baseSlug = slugifyProjectName(input.slug ?? input.name);
  let slug = baseSlug;
  let attempt = 0;
  while (attempt < 20) {
    const existing = await db.query.workspaces.findFirst({
      where: eq(workspaces.slug, slug),
    });
    if (!existing) break;
    attempt += 1;
    slug = `${baseSlug}-${attempt + 1}`;
  }

  const [project] = await db
    .insert(workspaces)
    .values({
      name: input.name.trim(),
      slug,
    })
    .returning();

  await ensureSystemRoles(project.id);
  const adminRole = await getSystemRole(project.id, "admin");

  await db.insert(workspaceMembers).values({
    workspaceId: project.id,
    userId: input.creatorUserId,
    role: "admin",
    customRoleId: adminRole.id,
  });

  return project;
}

export async function updateProject(
  projectId: string,
  patch: { name?: string; archived?: boolean },
) {
  const updates: Partial<typeof workspaces.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (patch.name !== undefined) updates.name = patch.name.trim();
  if (patch.archived === true) updates.archivedAt = new Date();
  if (patch.archived === false) updates.archivedAt = null;

  const [updated] = await db
    .update(workspaces)
    .set(updates)
    .where(eq(workspaces.id, projectId))
    .returning();
  return updated ?? null;
}

export async function deleteProject(projectId: string) {
  const defaultWs = await ensureDefaultWorkspace();
  if (projectId === defaultWs.id) {
    throw new Error("Cannot delete the default project");
  }
  await db.delete(workspaces).where(eq(workspaces.id, projectId));
}

export async function userIsProjectAdminAnywhere(userId: string) {
  const rows = await db.query.workspaceMembers.findMany({
    where: eq(workspaceMembers.userId, userId),
    with: { workspace: true, customRole: true },
  });
  return rows.some((r) => {
    if (!r.workspace || r.workspace.archivedAt != null) return false;
    const actions = membershipActions(r);
    return actionsAllowAdmin(actions) || r.role === "admin";
  });
}
