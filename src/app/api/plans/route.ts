import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { environments } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { createPlanSchema, listPlans, savePlan } from "@/lib/tcm/plans";

export async function GET(request: Request) {
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
  const workspaceId = access.ctx.project.id;
  const [plans, envs] = await Promise.all([
    listPlans(workspaceId),
    db.query.environments.findMany({
      where: eq(environments.workspaceId, workspaceId),
    }),
  ]);
  return NextResponse.json({
    plans,
    environments: envs.map((e) => ({ id: e.id, name: e.name, kind: e.kind })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "runs.create",
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
  const parsed = createPlanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid plan" },
      { status: 400 },
    );
  }
  const result = await savePlan({ workspaceId: access.ctx.project.id, actorId: session.user.id, data: parsed.data });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ plan: result.plan }, { status: 201 });
}
