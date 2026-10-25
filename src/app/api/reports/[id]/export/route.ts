import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { recordAuditEvent } from "@/lib/audit";
import { requireProjectAccess } from "@/lib/project";
import { getRunReport, isUuid } from "@/lib/queries";
import { parseExportFormat, runExportResponse } from "@/lib/tcm/export-http";
import { db } from "@/db";
import { and, eq } from "drizzle-orm";
import { runs } from "@/db/schema";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: Params) {
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
  const { id } = await params;
  if (!isUuid(id) || !z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }
  const format = parseExportFormat(new URL(request.url).searchParams.get("format"));
  if (!format) {
    return NextResponse.json(
      { error: "format must be csv, xlsx, or pdf" },
      { status: 400 },
    );
  }
  const report = await getRunReport(access.ctx.project.id, id);
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const run = await db.query.runs.findFirst({
    where: and(eq(runs.id, id), eq(runs.workspaceId, access.ctx.project.id)),
    with: { results: { with: { case: true } } },
  });
  const rows = (run?.results ?? []).map((r) => ({
    caseKey: r.case?.key ?? r.externalKey ?? "AUTO",
    title: r.case?.title ?? r.title ?? "Untitled",
    status: r.status,
    notes: r.notes,
    durationMs: r.durationMs,
    iteration: r.iterationValuesJson ?? "",
    browser: run?.matrixBrowser ?? "",
    os: run?.matrixOs ?? "",
  }));
  await recordAuditEvent({
    action: "export.report",
    actorId: session.user.id,
    workspaceId: access.ctx.project.id,
    targetType: "run",
    targetId: id,
    metadata: { format },
    request,
  });
  return runExportResponse({
    format,
    filename: `run-${report.run.name}`,
    title: report.run.name,
    environment: report.run.environment,
    kpis: report.kpis,
    rows,
  });
}
