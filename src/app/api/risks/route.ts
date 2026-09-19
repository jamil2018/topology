import { NextResponse } from "next/server";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { qualityEdges, risks } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  description: z.string().optional().default(""),
  criticality: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  mitigatesIntentIds: z.array(z.string().uuid()).optional().default([]),
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

  const rows = await db.query.risks.findMany({
    where: eq(risks.workspaceId, access.ctx.project.id),
    orderBy: [asc(risks.key)],
  });
  return NextResponse.json({ risks: rows });
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
      .insert(risks)
      .values({
        workspaceId,
        key: parsed.data.key,
        title: parsed.data.title,
        description: parsed.data.description,
        criticality: parsed.data.criticality,
      })
      .returning();

    if (parsed.data.mitigatesIntentIds.length > 0) {
      await db.insert(qualityEdges).values(
        parsed.data.mitigatesIntentIds.map((intentId) => ({
          workspaceId,
          fromType: "risk" as const,
          fromId: created.id,
          toType: "intent" as const,
          toId: intentId,
          relation: "mitigates" as const,
        })),
      );
    }

    return NextResponse.json({ risk: created }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Risk key already exists or create failed" },
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
    .update(risks)
    .set({ ...rest, updatedAt: new Date() })
    .where(and(eq(risks.id, id), eq(risks.workspaceId, workspaceId)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ risk: updated });
}
