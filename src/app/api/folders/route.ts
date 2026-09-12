import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { folders } from "@/db/schema";
import { listFolders } from "@/lib/queries";

const createFolderSchema = z.object({
  name: z.string().min(1).max(120),
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

  const body = await request.json();
  const parsed = createFolderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [created] = await db
    .insert(folders)
    .values({
      name: parsed.data.name,
      parentId: parsed.data.parentId ?? null,
    })
    .returning();

  return NextResponse.json({ folder: created }, { status: 201 });
}
