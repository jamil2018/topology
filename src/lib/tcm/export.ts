import { strToU8, zipSync } from "fflate";

const FORMULA_START = /^[=+\-@]/;

export type ExportColumn = { key: string; header: string };

export function escapeCsvCell(value: string): string {
  const formula = FORMULA_START.test(value.trim());
  const safe = formula ? `'${value}` : value;
  if (formula || /[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function buildCsv(
  columns: readonly ExportColumn[],
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const header = columns.map((c) => escapeCsvCell(c.header)).join(",");
  const body = rows.map((row) =>
    columns
      .map((c) => escapeCsvCell(row[c.key] == null ? "" : String(row[c.key])))
      .join(","),
  );
  return [header, ...body].join("\n");
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** An Office Open XML workbook with explicitly typed, formula-safe cells. */
export function buildXlsx(
  sheetName: string,
  columns: readonly ExportColumn[],
  rows: ReadonlyArray<Record<string, unknown>>,
): Uint8Array {
  const name = xmlEscape(sheetName.replace(/[\[\]:*?/\\]/g, " ").replace(/^'+|'+$/g, "").slice(0, 31) || "Sheet1");
  const cell = (value: unknown) => typeof value === "number" && Number.isFinite(value)
    ? `<c><v>${value}</v></c>`
    : `<c t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value == null ? "" : String(value)).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")}</t></is></c>`;
  const data = [columns.map((column) => column.header), ...rows.map((row) => columns.map((column) => row[column.key]))];
  const worksheet = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data.map((values, index) => `<row r="${index + 1}">${values.map(cell).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zipSync({
    "[Content_Types].xml": strToU8(`<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`),
    "_rels/.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    "xl/workbook.xml": strToU8(`<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${name}" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    "xl/_rels/workbook.xml.rels": strToU8(`<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`),
    "xl/worksheets/sheet1.xml": strToU8(worksheet),
  }, { level: 6 });
}

function pdfEscape(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(text: string, width = 90): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > width) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Paginated PDF (Helvetica) for report text. */
export function buildPdf(title: string, lines: readonly string[]): Uint8Array {
  const wrapped: string[] = [];
  wrapped.push(...wrapLine(title, 70));
  wrapped.push("");
  for (const line of lines) {
    wrapped.push(...wrapLine(line, 90));
  }
  const pageCount = Math.max(1, Math.ceil(wrapped.length / 48));
  const fontId = 3 + pageCount * 2;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${Array.from({ length: pageCount }, (_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pageCount} >>`,
  ];
  for (let i = 0; i < pageCount; i += 1) {
    const contentLines = ["BT", "/F1 12 Tf", "50 760 Td", "14 TL",
      ...wrapped.slice(i * 48, (i + 1) * 48).map((line) => `(${pdfEscape(line)}) '`), "ET"];
    const stream = contentLines.join("\n");
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${4 + i * 2} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
      `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    );
  }
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let i = 0; i < objects.length; i += 1) {
    offsets.push(Buffer.byteLength(body, "utf8"));
    body += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(body, "utf8");
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i += 1) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "utf8"));
}

export type RunExportRow = {
  caseKey: string;
  title: string;
  status: string;
  notes: string;
  durationMs: number | null;
  iteration?: string;
  browser?: string;
  os?: string;
};

export const RUN_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "caseKey", header: "Case" },
  { key: "title", header: "Title" },
  { key: "status", header: "Status" },
  { key: "notes", header: "Notes" },
  { key: "durationMs", header: "Duration ms" },
  { key: "iteration", header: "Iteration" },
  { key: "browser", header: "Browser" },
  { key: "os", header: "OS" },
];

export function runReportLines(input: {
  name: string;
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
}): string[] {
  const { kpis } = input;
  const lines = [
    `Environment: ${input.environment || "—"}`,
    `Results: ${kpis.passed} passed / ${kpis.failed} failed / ${kpis.blocked} blocked / ${kpis.skipped} skipped / ${kpis.untested} untested (${kpis.total} total)`,
    `Pass rate: ${kpis.passRate == null ? "n/a" : `${kpis.passRate}%`}`,
    "",
  ];
  for (const row of input.rows) {
    lines.push(
      `${row.caseKey} ${row.title} — ${row.status}${row.iteration ? ` [${row.iteration}]` : ""}`,
    );
  }
  return lines;
}

export type MilestoneExportRow = {
  name: string;
  status: string;
  badge: string;
  score: number;
  passRate: string;
  executedPct: number;
  openP0Failures: number;
  openBlockerIssues: number;
  reasons: string;
};

export const MILESTONE_EXPORT_COLUMNS: ExportColumn[] = [
  { key: "name", header: "Milestone" },
  { key: "status", header: "Status" },
  { key: "badge", header: "Readiness" },
  { key: "score", header: "Score" },
  { key: "passRate", header: "Pass rate" },
  { key: "executedPct", header: "Executed %" },
  { key: "openP0Failures", header: "Open P0 failures" },
  { key: "openBlockerIssues", header: "Open blockers" },
  { key: "reasons", header: "Reasons" },
];
