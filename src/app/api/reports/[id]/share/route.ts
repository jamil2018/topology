import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { requireProjectAccess } from "@/lib/project";
import { getRunReport, isUuid } from "@/lib/queries";
import { SHARE_TTL_MS, signShareToken } from "@/lib/tcm/share-token";
import { recordAuditEvent } from "@/lib/audit";

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
  const exp = Date.now() + SHARE_TTL_MS;
  const token = signShareToken({
    kind: "run",
    workspaceId: access.ctx.project.id,
    targetId: id,
    exp,
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
