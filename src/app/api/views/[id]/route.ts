import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireProjectAccess, ctxCanAdmin } from "@/lib/project";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    write: true,
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid view id" }, { status: 400 });
  }

  const existing = await db.query.savedViews.findFirst({
    where: and(
      eq(savedViews.id, id),
      eq(savedViews.workspaceId, workspaceId),

    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  if (existing.createdById !== session.user.id && !(existing.visibility === "team" && ctxCanAdmin(access.ctx))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await db.delete(savedViews).where(eq(savedViews.id, id));
  return NextResponse.json({ ok: true });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request, write: true });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid view id" }, { status: 400 });
  const existing = await db.query.savedViews.findFirst({ where: and(eq(savedViews.id, id), eq(savedViews.workspaceId, access.ctx.project.id)) });
  if (!existing) return NextResponse.json({ error: "View not found" }, { status: 404 });
  if (existing.createdById !== session.user.id && !(existing.visibility === "team" && ctxCanAdmin(access.ctx))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { caseViewConfigSchema, runViewConfigSchema, intentViewConfigSchema } = await import("@/lib/saved-views");
  const configSchema = existing.entity === "cases" ? caseViewConfigSchema : existing.entity === "runs" ? runViewConfigSchema : intentViewConfigSchema;
  const parsed = z.object({ name: z.string().trim().min(1).max(80), visibility: z.enum(["private", "team"]), config: configSchema }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  if (existing.createdById !== session.user.id && parsed.data.visibility !== "team") return NextResponse.json({ error: "Only the creator can make a shared view private" }, { status: 403 });
  const [view] = await db.update(savedViews).set({ name: parsed.data.name, visibility: parsed.data.visibility, configJson: JSON.stringify(parsed.data.config), updatedAt: new Date() }).where(eq(savedViews.id, id)).returning();
  return NextResponse.json({ view: { ...view, config: parsed.data.config } });
}
