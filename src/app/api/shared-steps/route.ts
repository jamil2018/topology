import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { sharedStepItems, sharedSteps } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { orderSteps } from "@/lib/tcm/steps";

const itemSchema = z.object({
  action: z.string().trim().min(1),
  expected: z.string().optional().default(""),
  data: z.string().optional().default(""),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().optional().default(""),
  items: z.array(itemSchema).min(1),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "cases.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const rows = await db.query.sharedSteps.findMany({
    where: eq(sharedSteps.workspaceId, access.ctx.project.id),
    with: { items: true },
    orderBy: [asc(sharedSteps.name)],
  });
  return NextResponse.json({
    sharedSteps: rows.map((row) => ({
      ...row,
      items: [...row.items].sort((a, b) => a.position - b.position),
    })),
  });
}

export async function POST(request: Request) {
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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid shared step" },
      { status: 400 },
    );
  }
  const [block] = await db
    .insert(sharedSteps)
    .values({
      workspaceId: access.ctx.project.id,
      name: parsed.data.name,
      description: parsed.data.description,
      createdById: session.user.id,
    })
    .returning();
  const items = orderSteps(parsed.data.items);
  await db.insert(sharedStepItems).values(
    items.map((item) => ({
      sharedStepId: block.id,
      position: item.position,
      action: item.action,
      expected: item.expected,
      data: item.data,
    })),
  );
  return NextResponse.json({ sharedStep: { ...block, items } }, { status: 201 });
}
