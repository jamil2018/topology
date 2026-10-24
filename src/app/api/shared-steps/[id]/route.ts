import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { sharedStepItems, sharedSteps } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { orderSteps } from "@/lib/tcm/steps";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().optional(),
  items: z
    .array(
      z.object({
        action: z.string().trim().min(1),
        expected: z.string().optional().default(""),
        data: z.string().optional().default(""),
      }),
    )
    .optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.edit",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const existing = await db.query.sharedSteps.findFirst({
    where: and(
      eq(sharedSteps.id, id),
      eq(sharedSteps.workspaceId, access.ctx.project.id),
    ),
  });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid shared step" }, { status: 400 });
  }
  const [updated] = await db
    .update(sharedSteps)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(sharedSteps.id, id))
    .returning();
  if (parsed.data.items) {
    await db.delete(sharedStepItems).where(eq(sharedStepItems.sharedStepId, id));
    const items = orderSteps(parsed.data.items);
    await db.insert(sharedStepItems).values(
      items.map((item) => ({
        sharedStepId: id,
        position: item.position,
        action: item.action,
        expected: item.expected,
        data: item.data,
      })),
    );
  }
  return NextResponse.json({ sharedStep: updated });
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.edit",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const [deleted] = await db
    .delete(sharedSteps)
    .where(
      and(
        eq(sharedSteps.id, id),
        eq(sharedSteps.workspaceId, access.ctx.project.id),
      ),
    )
    .returning();
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ sharedStep: deleted });
}
