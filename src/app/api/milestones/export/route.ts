import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordAuditEvent } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/project";
import { listMilestonesWithReadiness } from "@/lib/queries";
import {
  milestoneExportResponse,
  parseExportFormat,
} from "@/lib/tcm/export-http";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "reports.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const format = parseExportFormat(
    new URL(request.url).searchParams.get("format"),
  );
  if (!format) {
    return NextResponse.json(
      { error: "format must be csv, xlsx, or pdf" },
      { status: 400 },
    );
  }
  const items = await listMilestonesWithReadiness(access.ctx.project.id);
  await recordAuditEvent({
    action: "export.milestone",
    actorId: session.user.id,
    workspaceId: access.ctx.project.id,
    targetType: "milestone",
    metadata: { format },
    request,
  });
  return milestoneExportResponse({
    format,
    filename: "milestone-readiness",
    rows: items.map((item) => ({
      name: item.milestone.name,
      status: item.milestone.status,
      badge: item.badge,
      score: item.readiness.score,
      passRate:
        item.readiness.passRate == null ? "n/a" : `${item.readiness.passRate}%`,
      executedPct: item.readiness.executedPct,
      openP0Failures: item.readiness.openP0Failures,
      openBlockerIssues: item.readiness.openBlockerIssues,
      reasons: item.readiness.reasons.join("; "),
    })),
  });
}
