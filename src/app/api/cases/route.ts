import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, folders } from "@/db/schema";
import { listCases } from "@/lib/queries";

const createCaseSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  description: z.string().optional().default(""),
  preconditions: z.string().optional().default(""),
  steps: z.string().optional().default(""),
  expectedResult: z.string().optional().default(""),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  status: z
    .enum(["draft", "ready", "blocked", "deprecated"])
    .optional()
    .default("draft"),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const folderId = searchParams.get("folderId");
  const data = await listCases(folderId);
  return NextResponse.json({ cases: data });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createCaseSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (parsed.data.folderId) {
    const folder = await db.query.folders.findFirst({
      where: eq(folders.id, parsed.data.folderId),
    });
    if (!folder) {
      return NextResponse.json({ error: "Folder not found" }, { status: 400 });
    }
  }

  try {
    const [created] = await db
      .insert(cases)
      .values({
        ...parsed.data,
        createdById: session.user.id,
      })
      .returning();
    return NextResponse.json({ case: created }, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to create case";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json({ error: "Case key already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
