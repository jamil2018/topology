import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import {
  PROJECT_COOKIE,
  createProject,
  deleteProject,
  listUserProjects,
  requireProjectAccess,
  resolveActiveProject,
  updateProject,
  userIsProjectAdminAnywhere,
} from "@/lib/project";
import { canAdmin } from "@/lib/workspace-roles";
import { ensureDefaultWorkspace } from "@/lib/workspace";

const createSchema = z.object({
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(64).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(120).optional(),
  archived: z.boolean().optional(),
});

const selectSchema = z.object({
  id: z.string().uuid(),
});

function projectCookie(id: string) {
  return `${PROJECT_COOKIE}=${id}; Path=/; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}; HttpOnly`;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeArchived =
    new URL(request.url).searchParams.get("includeArchived") === "1";
  const projects = await listUserProjects(session.user.id, { includeArchived });
  const active = await resolveActiveProject(session.user.id);
  const canManage = await userIsProjectAdminAnywhere(session.user.id);

  return NextResponse.json({
    projects,
    activeProjectId: active?.project.id ?? null,
    canManage,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Select active project (persist cookie)
  if (body?.action === "select") {
    const parsed = selectSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const access = await requireProjectAccess(session.user.id, {
      preferredId: parsed.data.id,
    });
    if (!access.ok) {
      return NextResponse.json(
        { error: access.error },
        { status: access.status },
      );
    }
    const res = NextResponse.json({
      activeProjectId: access.ctx.project.id,
      project: {
        id: access.ctx.project.id,
        name: access.ctx.project.name,
        slug: access.ctx.project.slug,
        role: access.ctx.membership.role,
      },
    });
    res.headers.append("Set-Cookie", projectCookie(access.ctx.project.id));
    return res;
  }

  // Create project — any project admin (or first-time bootstrap)
  const canManage = await userIsProjectAdminAnywhere(session.user.id);
  if (!canManage) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const project = await createProject({
    name: parsed.data.name,
    slug: parsed.data.slug,
    creatorUserId: session.user.id,
  });

  const res = NextResponse.json(
    {
      project: {
        id: project.id,
        name: project.name,
        slug: project.slug,
        archivedAt: project.archivedAt,
      },
    },
    { status: 201 },
  );
  res.headers.append("Set-Cookie", projectCookie(project.id));
  return res;
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const access = await requireProjectAccess(session.user.id, {
    preferredId: parsed.data.id,
    admin: true,
  });
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  const updated = await updateProject(parsed.data.id, {
    name: parsed.data.name,
    archived: parsed.data.archived,
  });
  if (!updated) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  return NextResponse.json({
    project: {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      archivedAt: updated.archivedAt,
    },
  });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const access = await requireProjectAccess(session.user.id, {
    preferredId: id,
    admin: true,
  });
  if (!access.ok) {
    return NextResponse.json(
      { error: access.error },
      { status: access.status },
    );
  }

  // Allow delete even if archived — re-check admin membership including archived
  if (!canAdmin(access.ctx.membership.role)) {
    return NextResponse.json({ error: "Admin role required" }, { status: 403 });
  }

  try {
    const defaultWs = await ensureDefaultWorkspace();
    await deleteProject(id);
    const res = NextResponse.json({ ok: true });
    if (access.ctx.project.id === id) {
      res.headers.append("Set-Cookie", projectCookie(defaultWs.id));
    }
    return res;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delete failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
