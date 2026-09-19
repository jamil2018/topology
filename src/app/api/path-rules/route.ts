import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { components, pathComponentRules } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  pattern: z.string().min(1).max(512),
  componentId: z.string().uuid().optional(),
  componentKey: z.string().min(1).max(64).optional(),
});

const patchSchema = z.object({
  id: z.string().uuid(),
  pattern: z.string().min(1).max(512).optional(),
  componentId: z.string().uuid().optional(),
  componentKey: z.string().min(1).max(64).optional(),
});

async function resolveComponentId(
  workspaceId: string,
  opts: { componentId?: string; componentKey?: string },
): Promise<{ ok: true; componentId: string } | { ok: false; error: string }> {
  if (opts.componentId) {
    const row = await db.query.components.findFirst({
      where: and(
        eq(components.id, opts.componentId),
        eq(components.workspaceId, workspaceId),
      ),
    });
    if (!row) return { ok: false, error: "Component not found" };
    return { ok: true, componentId: row.id };
  }
  if (opts.componentKey) {
    const row = await db.query.components.findFirst({
      where: and(
        eq(components.key, opts.componentKey),
        eq(components.workspaceId, workspaceId),
      ),
    });
    if (!row) return { ok: false, error: "Component not found" };
    return { ok: true, componentId: row.id };
  }
  return { ok: false, error: "componentId or componentKey is required" };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "requirements.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const rows = await db.query.pathComponentRules.findMany({
    where: eq(pathComponentRules.workspaceId, access.ctx.project.id),
    orderBy: [asc(pathComponentRules.pattern)],
    with: { component: true },
  });

  return NextResponse.json({
    pathRules: rows.map((r) => ({
      id: r.id,
      pattern: r.pattern,
      componentId: r.componentId,
      componentKey: r.component?.key ?? null,
      componentTitle: r.component?.title ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "requirements.create",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const component = await resolveComponentId(workspaceId, parsed.data);
  if (!component.ok) {
    return NextResponse.json({ error: component.error }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(pathComponentRules)
      .values({
        workspaceId,
        pattern: parsed.data.pattern,
        componentId: component.componentId,
      })
      .returning();
    return NextResponse.json({ pathRule: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Path rule pattern already exists or create failed" },
      { status: 409 },
    );
  }
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "requirements.edit",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { id, pattern, componentId, componentKey } = parsed.data;
  const patch: { pattern?: string; componentId?: string; updatedAt: Date } = {
    updatedAt: new Date(),
  };
  if (pattern != null) patch.pattern = pattern;
  if (componentId != null || componentKey != null) {
    const component = await resolveComponentId(workspaceId, {
      componentId,
      componentKey,
    });
    if (!component.ok) {
      return NextResponse.json({ error: component.error }, { status: 400 });
    }
    patch.componentId = component.componentId;
  }

  const [updated] = await db
    .update(pathComponentRules)
    .set(patch)
    .where(
      and(
        eq(pathComponentRules.id, id),
        eq(pathComponentRules.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ pathRule: updated });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "requirements.delete",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const [deleted] = await db
    .delete(pathComponentRules)
    .where(
      and(
        eq(pathComponentRules.id, id),
        eq(pathComponentRules.workspaceId, access.ctx.project.id),
      ),
    )
    .returning();

  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
