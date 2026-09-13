import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { savedViews } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

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
      eq(savedViews.createdById, session.user.id),
    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  await db.delete(savedViews).where(eq(savedViews.id, id));
  return NextResponse.json({ ok: true });
}
