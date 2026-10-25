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
  it("emits SpreadsheetML with the sheet name and rows", () => {
    const xml = buildXlsx("Run report", RUN_EXPORT_COLUMNS, rows);
    expect(xml).toContain("ss:Name=\"Run report\"");
    expect(xml).toContain("LOGIN-1");
    expect(xml).toContain("ss:Type=\"Number\">120");
    expect(xml).toContain("&quot;no&quot;");
  });
});

describe("buildPdf + runReportLines", () => {
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
