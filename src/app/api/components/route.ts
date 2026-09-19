import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { components } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  description: z.string().optional().default(""),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
});

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

  const rows = await db.query.components.findMany({
    where: eq(components.workspaceId, access.ctx.project.id),
    orderBy: [asc(components.key)],
  });
  return NextResponse.json({ components: rows });
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

  try {
    const [created] = await db
      .insert(components)
      .values({
        workspaceId,
        key: parsed.data.key,
        title: parsed.data.title,
        description: parsed.data.description,
        criticality: parsed.data.criticality,
      })
      .returning();
    return NextResponse.json({ component: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Component key already exists or create failed" },
      { status: 409 },
    );
  }
}

const patchSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(240).optional(),
  description: z.string().optional(),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional(),
});

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

  const { id, ...rest } = parsed.data;
  const [updated] = await db
    .update(components)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(components.id, id), eq(components.workspaceId, workspaceId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ component: updated });
}
