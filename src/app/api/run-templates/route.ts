import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { runTemplates } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { runTemplateSchema } from "@/lib/run-template";
import { validateTemplateReferences } from "@/lib/run-template-access";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const templates = await db.select().from(runTemplates).where(eq(runTemplates.workspaceId, access.ctx.project.id)).orderBy(desc(runTemplates.updatedAt));
  return NextResponse.json({ templates });
}
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request, action: "runs.create" });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const parsed = runTemplateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const error = await validateTemplateReferences(access.ctx.project.id, parsed.data);
  if (error) return NextResponse.json({ error }, { status: 400 });
  const [template] = await db.insert(runTemplates).values({ ...parsed.data, workspaceId: access.ctx.project.id, createdById: session.user.id }).returning();
  return NextResponse.json({ template }, { status: 201 });
}
