import { lockCaseReviewPolicy, protectedCase } from "@/lib/case-review-policy";
import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, customFieldDefs, customFieldValues } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { validateFieldDef } from "@/lib/tcm/custom-fields";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  label: z.string().trim().min(1).max(80).optional(),
  type: z.enum(["text", "number", "boolean", "select", "date"]).optional(),
  options: z.array(z.string()).optional(),
  required: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "project.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const existing = await db.query.customFieldDefs.findFirst({
    where: and(
      eq(customFieldDefs.id, id),
      eq(customFieldDefs.workspaceId, access.ctx.project.id),
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
    return NextResponse.json({ error: "Invalid field" }, { status: 400 });
  }
  const checked = validateFieldDef({
    key: existing.key,
    label: parsed.data.label ?? existing.label,
    type: parsed.data.type ?? existing.type,
    options:
      parsed.data.options ??
      (existing.optionsJson ? (JSON.parse(existing.optionsJson) as string[]) : []),
  });
  if (!checked.ok) {
    return NextResponse.json({ error: checked.errors[0] }, { status: 400 });
  }
  const [field] = await db
    .update(customFieldDefs)
    .set({
      label: checked.def.label,
      type: checked.def.type,
      optionsJson:
        checked.def.type === "select"
          ? JSON.stringify(checked.def.options ?? [])
          : null,
      required: parsed.data.required ?? existing.required,
      updatedAt: new Date(),
    })
    .where(eq(customFieldDefs.id, id))
    .returning();
  return NextResponse.json({ field });
}

export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "project.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const workspaceId = access.ctx.project.id;
  return db.transaction(async (tx) => {
    if (await lockCaseReviewPolicy(tx, workspaceId, "no key update")) {
      const [reference] = await tx.select({ id: customFieldValues.id }).from(customFieldValues)
        .innerJoin(cases, eq(cases.id, customFieldValues.entityId))
        .innerJoin(customFieldDefs, eq(customFieldDefs.id, customFieldValues.fieldId))
        .where(and(protectedCase(workspaceId), eq(customFieldDefs.workspaceId, workspaceId),
          eq(customFieldValues.fieldId, id), eq(customFieldValues.entityType, "case"))).limit(1);
      if (reference) return NextResponse.json({ error: "Remove this field from the reviewed cases before deleting it." }, { status: 409 });
    }
    const [deleted] = await tx
      .delete(customFieldDefs)
      .where(
        and(
          eq(customFieldDefs.id, id),
          eq(customFieldDefs.workspaceId, access.ctx.project.id),
        ),
      )
      .returning();
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ field: deleted });
  });
}
