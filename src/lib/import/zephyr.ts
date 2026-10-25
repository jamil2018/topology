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
        return rec ? str(rec.name ?? rec.label ?? rec.title) : "";
      })
      .filter(Boolean)
      .join(";");
  }
  const rec = asRecord(value);
  return rec ? str(rec.name ?? rec.label ?? rec.title ?? rec.value) : "";
}

function flattenCase(raw: Record<string, unknown>): Record<string, string> {
  const script = asRecord(raw.testScript) ?? asRecord(raw.test_script);
  const stepsRaw = script?.steps ?? raw.steps;
  const list = Array.isArray(stepsRaw) ? stepsRaw : [];
  const formatted = formatSteps(
    list.map((item) => {
      const rec = asRecord(item) ?? {};
      return {
        action: str(rec.description ?? rec.action ?? rec.step ?? rec.text),
        expected: str(rec.expectedResult ?? rec.expected_result ?? rec.expected),
        data: str(rec.testData ?? rec.test_data ?? rec.data),
      };
    }),
  );
  const plain =
    str(script?.text) ||
    (typeof raw.testScript === "string" ? raw.testScript : "");
  const folder = str(
    raw.folder ?? asRecord(raw.folder)?.name ?? raw.folderName,
  );
  return {
    key: str(raw.key ?? raw.id),
    name: str(raw.name ?? raw.title),
    objective: str(raw.objective ?? raw.description),
    precondition: str(raw.precondition ?? raw.preconditions),
    steps: formatted.steps || plain,
    expectedResult: formatted.expectedResult,
    priority: str(raw.priority),
    status: str(raw.status),
    folder,
    labels: str(raw.labels ?? raw.tags),
  };
}

function collectCases(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row));
  }
  const rec = asRecord(parsed);
  const values = rec?.values ?? rec?.testCases ?? rec?.testcases ?? rec?.cases;
  if (Array.isArray(values)) {
    return values
      .map(asRecord)
      .filter((row): row is Record<string, unknown> => Boolean(row));
  }
  return [];
}

function parseZephyrJson(raw: string): Record<string, string>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Zephyr Scale JSON could not be parsed");
  }
  return collectCases(parsed).map(flattenCase);
}

function parseZephyrCsv(raw: string): Record<string, string>[] {
  const table = parseCsvTable(raw);
  return mergeStepRows(table.rows, {
    groupKeys: ["Key", "Name", "key", "name"],
    stepKeys: [
      "Test Script (Step-by-Step) - Step",
      "Step",
      "Action",
      "steps",
    ],
    expectedKeys: [
      "Test Script (Step-by-Step) - Expected Result",
      "Expected Result",
      "Expected",
    ],
    dataKeys: ["Test Script (Step-by-Step) - Test Data", "Test Data"],
  }).map((row) => ({
    ...row,
    key: row.Key ?? row.key ?? "",
    name: row.Name ?? row.name ?? row.title ?? "",
    folder: row.Folder ?? row.folder ?? "",
    precondition: row.Precondition ?? row.precondition ?? row.Preconditions ?? "",
    objective: row.Objective ?? row.objective ?? row.Description ?? "",
    priority: row.Priority ?? row.priority ?? "",
    status: row.Status ?? row.status ?? "",
    labels: row.Labels ?? row.labels ?? row.Tags ?? "",
  }));
}

export function parseZephyr(raw: string): ImportParseResult {
  const errors: string[] = [];
  const format = sniff(raw);
  let rows: Record<string, string>[] = [];
  try {
    rows = format === "json" ? parseZephyrJson(raw) : parseZephyrCsv(raw);
  } catch (err) {
    errors.push(
      err instanceof Error ? err.message : "Failed to parse Zephyr Scale file",
    );
  }
  const table: SourceTable = {
    provider: "zephyr",
    format,
    fields: uniqueFields(rows, [
      "key",
      "name",
      "objective",
      "precondition",
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
    errors.push("No Zephyr Scale cases found in the file");
  }
  return { table, suggestedMapping: suggestMapping(table.fields), errors };
}
