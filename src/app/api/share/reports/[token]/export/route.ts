import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { getRunReport } from "@/lib/queries";
import { parseExportFormat, runExportResponse } from "@/lib/tcm/export-http";
import { verifyShareToken } from "@/lib/tcm/share-token";

type Params = { params: Promise<{ token: string }> };

export async function GET(request: Request, { params }: Params) {
  const { token } = await params;
  const verified = verifyShareToken(decodeURIComponent(token));
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 403 });
  }
  if (verified.payload.kind !== "run") {
    return NextResponse.json({ error: "Not a run report" }, { status: 400 });
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
  const report = await getRunReport(
    verified.payload.workspaceId,
    verified.payload.targetId,
  );
  if (!report) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }
  const run = await db.query.runs.findFirst({
    where: and(
      eq(runs.id, verified.payload.targetId),
      eq(runs.workspaceId, verified.payload.workspaceId),
    ),
    with: { results: { with: { case: true } } },
  });
  return runExportResponse({
    format,
    filename: `run-${report.run.name}`,
    title: report.run.name,
    environment: report.run.environment,
    kpis: report.kpis,
    rows: (run?.results ?? []).map((r) => ({
      caseKey: r.case?.key ?? r.externalKey ?? "AUTO",
      title: r.case?.title ?? r.title ?? "Untitled",
      status: r.status,
      notes: r.notes,
      durationMs: r.durationMs,
      iteration: r.iterationValuesJson ?? "",
      browser: run?.matrixBrowser ?? "",
      os: run?.matrixOs ?? "",
    })),
  });
}
