import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { savedViews } from "@/db/schema";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid view id" }, { status: 400 });
  }

  const existing = await db.query.savedViews.findFirst({
    where: and(
      eq(savedViews.id, id),
      eq(savedViews.createdById, session.user.id),
    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "View not found" }, { status: 404 });
  }

  await db.delete(savedViews).where(eq(savedViews.id, id));
  return NextResponse.json({ ok: true });
}
