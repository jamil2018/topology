import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { caseSteps, cases, sharedStepItems, sharedSteps } from "@/db/schema";
import { lockCaseReviewPolicy, protectedCase, type CaseReviewTransaction } from "@/lib/case-review-policy";
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
  const workspaceId = access.ctx.project.id;
  return db.transaction(async (tx) => {
    if (parsed.data.items && await sharedStepInReview(tx, workspaceId, id)) return sharedStepConflict();
    const [updated] = await tx
      .update(sharedSteps)
      .set({
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.description !== undefined
          ? { description: parsed.data.description }
          : {}),
        updatedAt: new Date(),
      })
      .where(and(eq(sharedSteps.id, id), eq(sharedSteps.workspaceId, workspaceId)))
      .returning();
    if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (parsed.data.items) {
      await tx.delete(sharedStepItems).where(eq(sharedStepItems.sharedStepId, id));
      const items = orderSteps(parsed.data.items);
      if (items.length) await tx.insert(sharedStepItems).values(
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
  });
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
  return db.transaction(async (tx) => {
    if (await sharedStepInReview(tx, access.ctx.project.id, id)) return sharedStepConflict();
    const [deleted] = await tx
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
  });
}

async function sharedStepInReview(tx: CaseReviewTransaction, workspaceId: string, id: string) {
  if (!await lockCaseReviewPolicy(tx, workspaceId, "no key update")) return false;
  const [reference] = await tx.select({ id: caseSteps.id }).from(caseSteps)
    .innerJoin(cases, eq(cases.id, caseSteps.caseId))
    .where(and(protectedCase(workspaceId), eq(caseSteps.sharedStepId, id))).limit(1);
  return Boolean(reference);
}

function sharedStepConflict() {
  return NextResponse.json({
    code: "CASE_REVIEW_REQUIRED",
    error: "Create a replacement shared step and propose it on the cases that use this step.",
  }, { status: 409 });
}
