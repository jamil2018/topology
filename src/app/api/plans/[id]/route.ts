import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { environments, testPlans } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { getPlan, savePlan, updatePlanSchema } from "@/lib/tcm/plans";

type Params = { params: Promise<{ id: string }> };

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
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = updatePlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan update" }, { status: 400 });
  }
  const result = await savePlan({ workspaceId: access.ctx.project.id, actorId: session.user.id, planId: id, data: parsed.data });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ plan: result.plan });
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
