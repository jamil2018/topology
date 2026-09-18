import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { dbErrorResponse, readJsonBody } from "@/lib/http-errors";
import {
  PROJECT_COOKIE,
  createProject,
  deleteProject,
  listUserProjects,
  readPreferredProjectId,
  requireProjectAccess,
  resolveActiveProject,
  updateProject,
  userIsProjectAdminAnywhere,
} from "@/lib/project";
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

function sameProject(
  access: { ok: true; ctx: { project: { id: string } } } | { ok: false; status: number; error: string },
  id: string,
) {
  if (!access.ok || access.ctx.project.id !== id) {
    return NextResponse.json(
      { error: access.ok ? "No accessible project" : access.error },
      { status: access.ok ? 403 : access.status },
    );
  }
  return null;
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const includeArchived =
    new URL(request.url).searchParams.get("includeArchived") === "1";
  const projects = await listUserProjects(session.user.id, { includeArchived });
  const preferred = await readPreferredProjectId(request);
  const active = await resolveActiveProject(session.user.id, preferred);
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

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const body = json.body as { action?: unknown } | null;

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
    if (!access.ok || access.ctx.project.id !== parsed.data.id) {
      return NextResponse.json(
        { error: access.ok ? "No accessible project" : access.error },
        { status: access.ok ? 403 : access.status },
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

  let project;
  try {
    project = await createProject({
      name: parsed.data.name,
      slug: parsed.data.slug,
      creatorUserId: session.user.id,
    });
  } catch (err) {
    return dbErrorResponse(err, "Create failed", {
      uniqueMessage: "A project with that name already exists",
    });
  }

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

  const json = await readJsonBody(request);
  if (!json.ok) return json.response;
  const parsed = patchSchema.safeParse(json.body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const access = await requireProjectAccess(session.user.id, {
    preferredId: parsed.data.id,
    action: "project.manage",
    allowArchived: true,
  });
  const denied = sameProject(access, parsed.data.id);
  if (denied) return denied;

  let updated;
  try {
    updated = await updateProject(parsed.data.id, {
      name: parsed.data.name,
      archived: parsed.data.archived,
    });
  } catch (err) {
    return dbErrorResponse(err, "Update failed");
  }
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
  if (!id || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const access = await requireProjectAccess(session.user.id, {
    preferredId: id,
    action: "project.manage",
    allowArchived: true,
  });
  const denied = sameProject(access, id);
  if (denied) return denied;

  try {
    const defaultWs = await ensureDefaultWorkspace();
    await deleteProject(id);
    const res = NextResponse.json({ ok: true });
    if (access.ok && access.ctx.project.id === id) {
      res.headers.append("Set-Cookie", projectCookie(defaultWs.id));
    }
    return res;
  } catch (err) {
    if (err instanceof Error && err.message === "Cannot delete the default project") {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return dbErrorResponse(err, "Delete failed");
  }
}
