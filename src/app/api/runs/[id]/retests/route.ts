import { NextResponse } from "next/server";
import { and, eq, or } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { runs, runResults, retestSources } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await requireProjectAccess(session.user.id, { request, action: "runs.view" });
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid run" }, { status: 400 });
  const source = alias(runResults, "source_result"), target = alias(runResults, "target_result"), sourceRun = alias(runs, "source_run"), targetRun = alias(runs, "target_run");
  const lineage = await db.select({ sourceId: source.id, sourceRunId: sourceRun.id, sourceName: sourceRun.name, sourceStatus: source.status, resultId: target.id, runId: targetRun.id, name: targetRun.name, status: target.status }).from(retestSources)
    .innerJoin(source, eq(source.id, retestSources.sourceResultId)).innerJoin(target, eq(target.id, retestSources.resultId))
    .innerJoin(sourceRun, eq(sourceRun.id, source.runId)).innerJoin(targetRun, eq(targetRun.id, target.runId))
    .where(and(eq(sourceRun.workspaceId, access.ctx.project.id), eq(targetRun.workspaceId, access.ctx.project.id), or(eq(sourceRun.id, id), eq(targetRun.id, id))));
  return NextResponse.json({ lineage });
}
