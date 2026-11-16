import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireProjectAccess } from "@/lib/project";
import { getRunReport, isUuid } from "@/lib/queries";
import { SHARE_TTL_MS, signShareToken } from "@/lib/tcm/share-token";
import { recordAuditEvent } from "@/lib/audit";

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { auditEvents, runs } from "@/db/schema";
import { clientIp, clientUserAgent } from "@/lib/request-meta";
import { getReportShareGeneration } from "@/lib/tcm/report-share";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "reports.create",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }
  const report = await getRunReport(access.ctx.project.id, id);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const generation = await getReportShareGeneration(access.ctx.project.id, id);
  if (generation === undefined) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const exp = Date.now() + SHARE_TTL_MS;
  const token = signShareToken({
    kind: "run",
    workspaceId: access.ctx.project.id,
    targetId: id,
    exp,
    generation,
  });
  const url = new URL(request.url);
  const sharePath = `/share/reports/${token}`;
  await recordAuditEvent({
    action: "export.report",
    actorId: session.user.id,
    workspaceId: access.ctx.project.id,
    targetType: "run",
    targetId: id,
    metadata: { share: true },
    request,
  });
  return NextResponse.json({
    token,
    url: `${url.origin}${sharePath}`,
    path: sharePath,
    expiresAt: new Date(exp).toISOString(),
  });
}

/** Invalidate all previously issued URLs, including legacy generation-zero links. */
export async function DELETE(request: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, { request, action: "reports.create" });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  const revoked = await db.transaction(async (tx) => {
    const [run] = await tx.update(runs)
      .set({ shareGeneration: sql`${runs.shareGeneration} + 1` })
      .where(and(eq(runs.id, id), eq(runs.workspaceId, access.ctx.project.id)))
      .returning({ generation: runs.shareGeneration });
    if (!run) return false;
    // Revocation must not succeed without its audit record.
    await tx.insert(auditEvents).values({
      action: "report.share.revoke", actorId: session.user.id,
      workspaceId: access.ctx.project.id, targetType: "run", targetId: id,
      metadataJson: JSON.stringify({ generation: run.generation }),
      ip: clientIp(request), userAgent: clientUserAgent(request),
    });
    return true;
  });
  return revoked
    ? NextResponse.json({ revoked: true })
    : NextResponse.json({ error: "Report not found" }, { status: 404 });
}
