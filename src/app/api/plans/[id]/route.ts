import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { environments, testPlans } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { getPlan, matrixFromBody, replacePlanCases } from "@/lib/tcm/plans";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(["draft", "active", "completed", "archived"]).optional(),
  milestoneId: z.string().uuid().nullable().optional(),
  matrix: z
    .object({
      browsers: z.array(z.string()).optional(),
      operatingSystems: z.array(z.string()).optional(),
      environmentIds: z.array(z.string().uuid()).optional(),
    })
    .optional(),
  caseIds: z.array(z.string().uuid()).optional(),
});

export async function GET(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "runs.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  }
  const plan = await getPlan(access.ctx.project.id, id);
  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const envs = await db.query.environments.findMany({
    where: eq(environments.workspaceId, access.ctx.project.id),
  });
  return NextResponse.json({
    plan,
    environments: envs.map((e) => ({ id: e.id, name: e.name, kind: e.kind })),
  });
}

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "runs.edit",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  }
  const existing = await db.query.testPlans.findFirst({
    where: and(
      eq(testPlans.id, id),
      eq(testPlans.workspaceId, access.ctx.project.id),
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
    return NextResponse.json({ error: "Invalid plan update" }, { status: 400 });
  }
  const [plan] = await db
    .update(testPlans)
    .set({
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.description !== undefined
        ? { description: parsed.data.description }
        : {}),
      ...(parsed.data.status !== undefined ? { status: parsed.data.status } : {}),
      ...(parsed.data.milestoneId !== undefined
        ? { milestoneId: parsed.data.milestoneId }
        : {}),
      ...(parsed.data.matrix !== undefined
        ? { matrixJson: matrixFromBody(parsed.data.matrix) }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(testPlans.id, id))
    .returning();
  if (parsed.data.caseIds) {
    await replacePlanCases(id, parsed.data.caseIds);
  }
  return NextResponse.json({ plan });
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "runs.delete",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid plan id" }, { status: 400 });
  }
  const [deleted] = await db
    .delete(testPlans)
    .where(
      and(
        eq(testPlans.id, id),
        eq(testPlans.workspaceId, access.ctx.project.id),
      ),
    )
    .returning();
  if (!deleted) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ plan: deleted });
}
