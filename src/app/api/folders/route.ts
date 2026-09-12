import { NextResponse } from "next/server";
import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { listFolders } from "@/lib/queries";

const createFolderSchema = z.object({
  name: z.string().trim().min(1, "Folder name is required").max(120),
  parentId: z.string().uuid().nullable().optional(),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await listFolders();
  return NextResponse.json({ folders: data });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  const existing = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        sql`lower(${folders.name}) = ${name.toLowerCase()}`,
        parentId ? eq(folders.parentId, parentId) : isNull(folders.parentId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json(
      { error: "A folder with this name already exists" },
      { status: 409 },
    );
  }

  try {
    const [created] = await db
      .insert(folders)
      .values({
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
