import { NextResponse } from "next/server";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { folders } from "@/db/schema";

const updateFolderSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required").max(120),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateFolderSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid folder";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const existing = await db.query.folders.findFirst({
    where: eq(folders.id, id),
  });
  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  const name = parsed.data.name;
  const parentId = existing.parentId ?? null;

  const clash = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        ne(folders.id, id),
        sql`lower(${folders.name}) = ${name.toLowerCase()}`,
        parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
      ),
    )
    .limit(1);

  if (clash.length > 0) {
    return NextResponse.json(
      { error: "A folder with this name already exists" },
      { status: 409 },
    );
  }

  try {
    const [updated] = await db
      .update(folders)
      .set({ name, updatedAt: new Date() })
      .where(eq(folders.id, id))
      .returning();

    return NextResponse.json({ folder: updated });
  } catch {
    return NextResponse.json(
      { error: "Failed to rename folder" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
  }

  const existing = await db.query.folders.findFirst({
    where: eq(folders.id, id),
  });
  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  try {
    // Promote any child folders to root so delete is not blocked by nesting.
    await db
      .update(folders)
      .set({ parentId: null, updatedAt: new Date() })
      .where(eq(folders.parentId, id));

    // Cases + milestones use ON DELETE SET NULL → become unfiled.
    const [deleted] = await db
      .delete(folders)
      .where(eq(folders.id, id))
      .returning();

    return NextResponse.json({ folder: deleted });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete folder" },
      { status: 500 },
    );
  }
}
