import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { environments, testPlans } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { listPlans, matrixFromBody, replacePlanCases } from "@/lib/tcm/plans";

const matrixSchema = z.object({
  browsers: z.array(z.string()).optional(),
  operatingSystems: z.array(z.string()).optional(),
  environmentIds: z.array(z.string().uuid()).optional(),
});

const createSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().optional().default(""),
  milestoneId: z.string().uuid().nullable().optional(),
  matrix: matrixSchema.optional(),
  caseIds: z.array(z.string().uuid()).optional(),
});

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
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid plan" },
      { status: 400 },
    );
  }
  const [plan] = await db
    .insert(testPlans)
    .values({
      workspaceId: access.ctx.project.id,
      name: parsed.data.name,
      description: parsed.data.description,
      milestoneId: parsed.data.milestoneId ?? null,
      matrixJson: matrixFromBody(parsed.data.matrix ?? {}),
      createdById: session.user.id,
    })
    .returning();
  if (parsed.data.caseIds?.length) {
    await replacePlanCases(plan.id, parsed.data.caseIds);
  }
  return NextResponse.json({ plan }, { status: 201 });
}
