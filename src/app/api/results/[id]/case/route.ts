import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, runs, runResults, resultCaseLinks } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request, action: "automation.manage" });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  const parsed = z.object({ caseId: z.string().uuid() }).safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(id).success || !parsed.success) return NextResponse.json({ error: "Select an executable case" }, { status: 400 });
  const [result] = await db.select({ id: runResults.id, caseId: runResults.caseId }).from(runResults).innerJoin(runs, eq(runs.id, runResults.runId)).where(and(eq(runResults.id, id), eq(runs.workspaceId, access.ctx.project.id)));
  const target = await db.query.cases.findFirst({ where: and(eq(cases.id, parsed.data.caseId), eq(cases.workspaceId, access.ctx.project.id)) });
  if (!result || !target) return NextResponse.json({ error: "Result or case unavailable in this project" }, { status: 404 });
  if (result.caseId) return NextResponse.json({ error: "This result already has an executable case" }, { status: 409 });
  await db.insert(resultCaseLinks).values({ resultId: id, caseId: target.id, createdById: session.user.id }).onConflictDoUpdate({ target: resultCaseLinks.resultId, set: { caseId: target.id, createdById: session.user.id, createdAt: new Date() } });
  return NextResponse.json({ ok: true });
}
