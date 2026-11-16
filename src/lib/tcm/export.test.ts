import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import {
  buildCsv,
  buildPdf,
  buildXlsx,
  MILESTONE_EXPORT_COLUMNS,
  RUN_EXPORT_COLUMNS,
  runReportLines,
} from "./export";

const rows = [
  {
    caseKey: "LOGIN-1",
    title: "Happy path",
    status: "passed",
    notes: "ok",
    durationMs: 120,
    iteration: "chrome",
  },
  {
    caseKey: "LOGIN-2",
    title: '=cmd',
    status: "failed",
    notes: 'said "no"',
    durationMs: null,
  },
];

describe("buildCsv", () => {
  it("quotes commas/quotes and prefixes formula cells", () => {
    const csv = buildCsv(RUN_EXPORT_COLUMNS, rows);
    expect(csv.split("\n")[0]).toContain("Case");
    expect(csv).toContain("LOGIN-1");
    expect(csv).toContain("\"'=cmd\"");
    expect(csv).toContain("\"said \"\"no\"\"\"");
  });
});

describe("buildXlsx", () => {
  it("packages a real workbook with typed values and formula-safe text", () => {
    const archive = unzipSync(buildXlsx("Run/report", RUN_EXPORT_COLUMNS, rows));
    expect(Object.keys(archive).sort()).toEqual(["[Content_Types].xml", "_rels/.rels", "xl/_rels/workbook.xml.rels", "xl/workbook.xml", "xl/worksheets/sheet1.xml"].sort());
    expect(strFromU8(archive["xl/workbook.xml"])).toContain('name="Run report"');
    const sheet = strFromU8(archive["xl/worksheets/sheet1.xml"]);
    expect(sheet.match(/<row /g)).toHaveLength(3);
    for (const text of ["Case", "LOGIN-1", "LOGIN-2", "Happy path", "=cmd", "&quot;no&quot;"]) expect(sheet).toContain(text);
    expect(sheet).toContain("<c><v>120</v></c>");
    expect(sheet).toContain('t="inlineStr"><is><t xml:space="preserve">=cmd');
    expect(sheet).not.toContain("<f>");
  });
});

describe("buildPdf + runReportLines", () => {
  it("preserves report rows beyond the first page", () => {
    const pdf = Buffer.from(buildPdf("Long report", Array.from({ length: 100 }, (_, i) => `ROW-${i}`))).toString("latin1");
    expect(pdf).toContain("/Count 3");
    expect(pdf).toContain("(ROW-99)");
    expect(pdf.match(/\(ROW-\d+\)/g)).toHaveLength(100);
  });
  it("builds a PDF that includes the title stream", () => {
    const lines = runReportLines({
      name: "Smoke",
      environment: "staging",
      kpis: {
        passed: 1,
        failed: 1,
        blocked: 0,
        skipped: 0,
        untested: 0,
        total: 2,
        passRate: 50,
      },
      rows,
    });
    const pdf = buildPdf("Smoke", lines);
    const text = Buffer.from(pdf).toString("latin1");
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("%%EOF");
    expect(text).toContain("Smoke");
    expect(text).toContain("LOGIN-1");
    expect(MILESTONE_EXPORT_COLUMNS[0]?.key).toBe("name");
  });
});
