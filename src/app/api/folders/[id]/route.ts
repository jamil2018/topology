import { NextResponse } from "next/server";
import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { wouldCreateFolderCycle } from "@/lib/folder-tree";
import { isLockFailure } from "@/lib/pg-error";
import { requireProjectAccess } from "@/lib/project";

const updateFolderSchema = z
  .object({
    name: z.string().trim().min(1, "Folder name is required").max(120).optional(),
    parentId: z.string().uuid().nullable().optional(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined, {
    message: "Provide name and/or parentId",
  });

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "folders.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

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
    where: and(eq(folders.id, id), eq(folders.workspaceId, workspaceId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  try {
    // Lock every folder in the project (id order) and re-check the cycle on
    // that snapshot. Interleaved A.parent=B / B.parent=A both pass an unlocked
    // check; the second waits, sees the first write, and is rejected.
    const outcome = await db.transaction(async (tx) => {
      const locked = await tx
        .select({
          id: folders.id,
          name: folders.name,
          parentId: folders.parentId,
        })
        .from(folders)
        .where(eq(folders.workspaceId, workspaceId))
        .orderBy(folders.id)
        .for("update");

      const moving = locked.find((folder) => folder.id === id);
      if (!moving) return { kind: "missing" as const };

      const name = parsed.data.name ?? moving.name;
      const parentId =
        parsed.data.parentId !== undefined
          ? parsed.data.parentId
          : (moving.parentId ?? null);

      if (parentId) {
        const parent = locked.find((folder) => folder.id === parentId);
        if (!parent) return { kind: "parent-missing" as const };
        if (
          wouldCreateFolderCycle(
            locked.map((folder) => ({
              id: folder.id,
              name: folder.name,
              parentId: folder.parentId ?? null,
            })),
            id,
            parentId,
          )
        ) {
          return { kind: "cycle" as const };
        }
      }

      const clash = await tx
        .select({ id: folders.id })
        .from(folders)
        .where(
          and(
            eq(folders.workspaceId, workspaceId),
            ne(folders.id, id),
            sql`lower(${folders.name}) = ${name.toLowerCase()}`,
            parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
          ),
        )
        .limit(1);
      if (clash.length > 0) return { kind: "clash" as const };

      const [updated] = await tx
        .update(folders)
        .set({ name, parentId, updatedAt: new Date() })
        .where(and(eq(folders.id, id), eq(folders.workspaceId, workspaceId)))
        .returning();
      return { kind: "ok" as const, folder: updated };
    });

    if (outcome.kind === "missing") {
      return NextResponse.json({ error: "Folder not found" }, { status: 404 });
    }
    if (outcome.kind === "parent-missing") {
      return NextResponse.json(
        { error: "Parent folder not found" },
        { status: 404 },
      );
    }
    if (outcome.kind === "cycle") {
      return NextResponse.json(
        { error: "Cannot move a folder into itself or a descendant" },
        { status: 400 },
      );
    }
    if (outcome.kind === "clash") {
      return NextResponse.json(
        { error: "A folder with this name already exists" },
        { status: 409 },
      );
    }
    return NextResponse.json({ folder: outcome.folder });
  } catch (err) {
    if (isLockFailure(err)) {
      return NextResponse.json(
        { error: "Could not lock folders to apply this move. Retry." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Failed to update folder" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "folders.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid folder id" }, { status: 400 });
  }

  const existing = await db.query.folders.findFirst({
    where: and(eq(folders.id, id), eq(folders.workspaceId, workspaceId)),
  });
  if (!existing) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  try {
    // Promote any child folders to root so delete is not blocked by nesting.
    await db
      .update(folders)
      .set({ parentId: null, updatedAt: new Date() })
      .where(
        and(eq(folders.parentId, id), eq(folders.workspaceId, workspaceId)),
      );

    // Cases + milestones use ON DELETE SET NULL → become unfiled.
    const [deleted] = await db
      .delete(folders)
      .where(and(eq(folders.id, id), eq(folders.workspaceId, workspaceId)))
      .returning();

    return NextResponse.json({ folder: deleted });
  } catch {
    return NextResponse.json(
      { error: "Failed to delete folder" },
      { status: 500 },
    );
  }
}
