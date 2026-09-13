import { and, asc, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import {
  workspaceMembers,
  workspaces,
  type Workspace,
  type WorkspaceMember,
  type WorkspaceRole,
} from "@/db/schema";
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

export type ActiveProjectContext = {
  project: Workspace;
  membership: WorkspaceMember;
  projects: ProjectSummary[];
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
    with: { workspace: true, user: true },
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

/**
 * Resolve the active project for a user.
 * Preference order: preferredId → first accessible → ensure default.
 */
export async function resolveActiveProject(
  userId: string,
  preferredId?: string | null,
): Promise<ActiveProjectContext | null> {
  let projects = await listUserProjects(userId);
  if (projects.length === 0) {
    await ensureMembership(userId, "admin");
    projects = await listUserProjects(userId);
  }
  if (projects.length === 0) return null;

  const pick =
    (preferredId && projects.find((p) => p.id === preferredId)) ||
    projects[0];

  const membership = await getMembershipForProject(userId, pick.id);
  if (!membership?.workspace) return null;

  return {
    project: membership.workspace,
    membership,
    projects,
  };
}

export async function requireProjectAccess(
  userId: string,
  options?: {
    preferredId?: string | null;
    request?: Request | null;
    write?: boolean;
    admin?: boolean;
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
      const ctx: ActiveProjectContext = {
        project: membership.workspace,
        membership,
        projects,
      };
      if (options.admin && !canAdmin(ctx.membership.role)) {
        return { ok: false, status: 403, error: "Admin role required" };
      }
      if (options.write && !canWrite(ctx.membership.role)) {
        return { ok: false, status: 403, error: "Write access required" };
      }
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
  if (options?.admin && !canAdmin(ctx.membership.role)) {
    return { ok: false, status: 403, error: "Admin role required" };
  }
  if (options?.write && !canWrite(ctx.membership.role)) {
    return { ok: false, status: 403, error: "Write access required" };
  }
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

  await db.insert(workspaceMembers).values({
    workspaceId: project.id,
    userId: input.creatorUserId,
    role: "admin",
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
    where: and(
      eq(workspaceMembers.userId, userId),
      eq(workspaceMembers.role, "admin"),
    ),
    with: { workspace: true },
  });
  return rows.some((r) => r.workspace && r.workspace.archivedAt == null);
}
