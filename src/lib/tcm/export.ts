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

/** SpreadsheetML 2003 workbook — Excel, Sheets, and Numbers open this as XLSX/XML. */
export function buildXlsx(
  sheetName: string,
  columns: readonly ExportColumn[],
  rows: ReadonlyArray<Record<string, unknown>>,
): string {
  const name = xmlEscape(sheetName.slice(0, 31) || "Sheet1");
  const header = `<Row>${columns
    .map(
      (c) =>
        `<Cell ss:StyleID="header"><Data ss:Type="String">${xmlEscape(c.header)}</Data></Cell>`,
    )
    .join("")}</Row>`;
  const body = rows
    .map((row) => {
      const cells = columns
        .map((c) => {
          const raw = row[c.key];
          if (typeof raw === "number" && Number.isFinite(raw)) {
            return `<Cell><Data ss:Type="Number">${raw}</Data></Cell>`;
          }
          const text = raw == null ? "" : String(raw);
          return `<Cell><Data ss:Type="String">${xmlEscape(text)}</Data></Cell>`;
        })
        .join("");
      return `<Row>${cells}</Row>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="header"><Font ss:Bold="1"/></Style></Styles>
<Worksheet ss:Name="${name}"><Table>${header}${body}</Table></Worksheet>
</Workbook>
`;
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

/** Minimal single-page-stream PDF (Helvetica) for report text. */
export function buildPdf(title: string, lines: readonly string[]): Uint8Array {
  const wrapped: string[] = [];
  wrapped.push(...wrapLine(title, 70));
  wrapped.push("");
  for (const line of lines) {
    wrapped.push(...wrapLine(line, 90));
  }
  const contentLines: string[] = ["BT", "/F1 12 Tf", "50 760 Td", "14 TL"];
  for (const line of wrapped.slice(0, 48)) {
    contentLines.push(`(${pdfEscape(line)}) '`);
  }
  contentLines.push("ET");
  const stream = contentLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
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
