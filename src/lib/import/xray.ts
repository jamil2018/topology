import { parseCsvTable } from "@/lib/csv";
import { suggestMapping } from "./mapping";
import { formatSteps, mergeStepRows, uniqueFields } from "./steps";
import type { ImportParseResult, SourceTable } from "./types";

function sniff(raw: string): "json" | "csv" {
  const trimmed = raw.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) return "json";
  return "csv";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function str(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item;
        const rec = asRecord(item);
        if (!rec) return "";
        return str(
          rec.definition ?? rec.name ?? rec.value ?? rec.label ?? rec.title,
        );
      })
      .filter(Boolean)
      .join(";");
  }
  const rec = asRecord(value);
  return rec
    ? str(rec.name ?? rec.value ?? rec.definition ?? rec.title)
    : "";
}

function flattenSteps(raw: unknown): { steps: string; expectedResult: string } {
  const list = Array.isArray(raw) ? raw : [];
  return formatSteps(
    list.map((item) => {
      const rec = asRecord(item) ?? {};
      return {
        action: str(rec.action ?? rec.step ?? rec.content),
        expected: str(rec.result ?? rec.expectedResult ?? rec.expected),
        data: str(rec.data ?? rec.testData),
      };
    }),
  );
}

function flattenTest(raw: Record<string, unknown>): Record<string, string> {
  const fields = asRecord(raw.fields) ?? raw;
  const stepsField =
    fields.steps ??
    raw.steps ??
    fields.customfield_steps ??
    Object.entries(fields).find(([key]) => /step/i.test(key))?.[1];
  const formatted = flattenSteps(stepsField);
  const preconditions = str(
    fields.preconditions ?? raw.preconditions ?? fields.precondition,
  );
  return {
    key: str(raw.key ?? fields.issuekey ?? fields.issueKey),
    summary: str(fields.summary ?? raw.summary ?? raw.name ?? fields.title),
    description: str(fields.description ?? raw.description),
    preconditions,
    steps: formatted.steps,
    expectedResult: formatted.expectedResult,
    priority: str(fields.priority ?? raw.priority),
    status: str(fields.status ?? raw.status),
    folder: str(
      fields.testRepositoryPath ??
        raw.testRepositoryPath ??
        fields.folder ??
        raw.folder,
    ),
    labels: str(fields.labels ?? raw.labels ?? fields.tags),
  };
}

function collectTests(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row));
  }
  const rec = asRecord(parsed);
  const tests = rec?.tests ?? rec?.issues ?? rec?.data;
  if (Array.isArray(tests)) {
    return tests
      .map(asRecord)
      .filter((row): row is Record<string, unknown> => Boolean(row));
  }
  return [];
}

function parseXrayJson(raw: string): Record<string, string>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Xray JSON could not be parsed");
  }
  return collectTests(parsed).map(flattenTest);
}

function parseXrayCsv(raw: string): Record<string, string>[] {
  const table = parseCsvTable(raw);
  return mergeStepRows(table.rows, {
    groupKeys: ["Issue Key", "Key", "Issue key", "key"],
    stepKeys: ["Action", "Step", "steps"],
    expectedKeys: ["Expected Result", "Result", "Expected"],
    dataKeys: ["Data", "Test Data"],
  }).map((row) => ({
    ...row,
    key: row["Issue Key"] ?? row.Key ?? row.key ?? "",
    summary: row.Summary ?? row.summary ?? row.Name ?? row.title ?? "",
    description: row.Description ?? row.description ?? "",
    preconditions:
      row.Preconditions ?? row.preconditions ?? row.Precondition ?? "",
    folder:
      row["Test Repository Path"] ??
      row.Folder ??
      row.folder ??
      "",
    priority: row.Priority ?? row.priority ?? "",
    status: row.Status ?? row.status ?? "",
    labels: row.Labels ?? row.labels ?? row.Tags ?? "",
  }));
}

export function parseXray(raw: string): ImportParseResult {
  const errors: string[] = [];
  const format = sniff(raw);
  let rows: Record<string, string>[] = [];
  try {
    rows = format === "json" ? parseXrayJson(raw) : parseXrayCsv(raw);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Failed to parse Xray file");
  }
  const table: SourceTable = {
    provider: "xray",
    format,
    fields: uniqueFields(rows, [
      "key",
      "summary",
      "description",
      "preconditions",
      "steps",
      "expectedResult",
      "priority",
      "status",
      "folder",
      "labels",
    ]),
    rows,
  };
  if (rows.length === 0 && errors.length === 0) {
    errors.push("No Xray cases found in the file");
  }
  return { table, suggestedMapping: suggestMapping(table.fields), errors };
}
