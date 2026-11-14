import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { runTemplates } from "@/db/schema";
import { requireProjectAccess, ctxCanAdmin, ctxHasAction } from "@/lib/project";
import { runTemplateSchema } from "@/lib/run-template";
import { validateTemplateReferences } from "@/lib/run-template-access";
type Params = { params: Promise<{ id: string }> };
async function accessTemplate(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) return { response: NextResponse.json({ error: access.error }, { status: access.status }) };
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return { response: NextResponse.json({ error: "Invalid template" }, { status: 400 }) };
  const [template] = await db.select().from(runTemplates).where(and(eq(runTemplates.workspaceId, access.ctx.project.id), eq(runTemplates.id, id)));
  if (!template) return { response: NextResponse.json({ error: "Template not found" }, { status: 404 }) };
  if (request.method !== "GET" && !(ctxCanAdmin(access.ctx) || (ctxHasAction(access.ctx, "runs.create") && template.createdById === session.user.id))) return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  return { template, workspaceId: access.ctx.project.id };
}
export async function GET(request: Request, params: Params) {
  const result = await accessTemplate(request, params);
  if (result.response) return result.response;
  return NextResponse.json({ template: result.template, warning: await validateTemplateReferences(result.workspaceId, result.template) });
}
export async function PATCH(request: Request, params: Params) {
  const result = await accessTemplate(request, params);
  if (result.response) return result.response;
  const parsed = runTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const error = await validateTemplateReferences(result.workspaceId, parsed.data);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const [template] = await db.update(runTemplates).set({ ...parsed.data, updatedAt: new Date() }).where(eq(runTemplates.id, result.template.id)).returning();
  return NextResponse.json({ template });
}
export async function DELETE(request: Request, params: Params) {
  const result = await accessTemplate(request, params);
  if (result.response) return result.response;
  await db.delete(runTemplates).where(eq(runTemplates.id, result.template.id));
  return NextResponse.json({ ok: true });
}
