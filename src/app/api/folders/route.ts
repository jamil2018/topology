import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { listFolders } from "@/lib/queries";

const createFolderSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required").max(120),
  parentId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const data = await listFolders(access.ctx.project.id);
  return NextResponse.json({ folders: data });
}

export async function POST(request: Request) {
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createFolderSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid folder";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const name = parsed.data.name;
  const parentId = parsed.data.parentId ?? null;

  if (parentId) {
    const parent = await db.query.folders.findFirst({
      where: and(
        eq(folders.id, parentId),
        eq(folders.workspaceId, workspaceId),
      ),
    });
    if (!parent) {
      return NextResponse.json(
        { error: "Parent folder not found" },
        { status: 404 },
      );
    }
  }

  const existing = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.workspaceId, workspaceId),
        sql`lower(${folders.name}) = ${name.toLowerCase()}`,
        parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "A folder with this name already exists in this location" },
      { status: 409 },
    );
  }

  try {
    const [created] = await db
      .insert(folders)
      .values({
        workspaceId,
        name,
        parentId,
      })
      .returning();

    return NextResponse.json({ folder: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 },
    );
  }
}
