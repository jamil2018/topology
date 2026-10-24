import { NextResponse } from "next/server";
import {
  buildCsv,
  buildPdf,
  buildXlsx,
  MILESTONE_EXPORT_COLUMNS,
  RUN_EXPORT_COLUMNS,
  runReportLines,
  type MilestoneExportRow,
  type RunExportRow,
} from "@/lib/tcm/export";

export type ExportFormat = "csv" | "xlsx" | "pdf";

export function parseExportFormat(value: string | null): ExportFormat | null {
  if (value === "csv" || value === "xlsx" || value === "pdf") return value;
  return null;
}

export function runExportResponse(input: {
  format: ExportFormat;
  filename: string;
  title: string;
  environment?: string;
  kpis: {
    passed: number;
    failed: number;
    blocked: number;
    skipped: number;
    untested: number;
    total: number;
    passRate: number | null;
  };
  rows: RunExportRow[];
}) {
  const base = input.filename.replace(/[^\w.-]+/g, "-");
  if (input.format === "csv") {
    const body = buildCsv(RUN_EXPORT_COLUMNS, input.rows);
    return fileResponse(`${base}.csv`, "text/csv; charset=utf-8", body);
  }
  if (input.format === "xlsx") {
    const body = buildXlsx(input.title, RUN_EXPORT_COLUMNS, input.rows);
    return fileResponse(
      `${base}.xlsx`,
      "application/vnd.ms-excel",
      body,
    );
  }
  const pdf = buildPdf(
    input.title,
    runReportLines({
      name: input.title,
      environment: input.environment,
      kpis: input.kpis,
      rows: input.rows,
    }),
  );
  return fileResponse(`${base}.pdf`, "application/pdf", pdf);
}

export function milestoneExportResponse(input: {
  format: ExportFormat;
  filename: string;
  rows: MilestoneExportRow[];
}) {
  const base = input.filename.replace(/[^\w.-]+/g, "-");
  if (input.format === "pdf") {
    const lines = input.rows.map(
      (row) =>
        `${row.name} — ${row.badge} (score ${row.score}, pass ${row.passRate}) ${row.reasons}`,
    );
    return fileResponse(
      `${base}.pdf`,
      "application/pdf",
      buildPdf("Milestone readiness", lines),
    );
  }
  if (input.format === "xlsx") {
    return fileResponse(
      `${base}.xlsx`,
      "application/vnd.ms-excel",
      buildXlsx("Milestones", MILESTONE_EXPORT_COLUMNS, input.rows),
    );
  }
  return fileResponse(
    `${base}.csv`,
    "text/csv; charset=utf-8",
    buildCsv(MILESTONE_EXPORT_COLUMNS, input.rows),
  );
}

function fileResponse(
  filename: string,
  contentType: string,
  body: string | Uint8Array,
) {
  const payload = typeof body === "string" ? body : Buffer.from(body);
  return new NextResponse(payload, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
