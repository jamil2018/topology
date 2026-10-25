import { parseCsvTable } from "@/lib/csv";
import { suggestMapping } from "./mapping";
import { formatSteps, uniqueFields } from "./steps";
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
        return rec ? str(rec.title ?? rec.name ?? rec.value) : "";
      })
      .filter(Boolean)
      .join(";");
  }
  const rec = asRecord(value);
  return rec ? str(rec.title ?? rec.name ?? rec.value) : "";
}

function parseStepsField(raw: unknown): { steps: string; expectedResult: string } {
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
      try {
        return parseStepsField(JSON.parse(trimmed));
      } catch {
        return { steps: trimmed, expectedResult: "" };
      }
    }
    return { steps: trimmed, expectedResult: "" };
  }
  const list = Array.isArray(raw)
    ? raw
    : Array.isArray(asRecord(raw)?.steps)
      ? (asRecord(raw)!.steps as unknown[])
      : [];
  return formatSteps(
    list.map((item) => {
      const rec = asRecord(item) ?? {};
      return {
        action: str(rec.action ?? rec.step ?? rec.content),
        expected: str(rec.expected_result ?? rec.expectedResult ?? rec.expected),
        data: str(rec.data ?? rec.input),
      };
    }),
  );
}

const QASE_PRIORITY: Record<string, string> = {
  "0": "medium",
  "1": "high",
  "2": "medium",
  "3": "low",
};

const QASE_STATUS: Record<string, string> = {
  "0": "actual",
  "1": "draft",
  "2": "deprecated",
};

function namedEnum(raw: string, table: Record<string, string>): string {
  return table[raw] ?? raw;
}

function flattenCase(raw: Record<string, unknown>): Record<string, string> {
  const formatted = parseStepsField(raw.steps);
  const suite = str(raw.suite ?? raw.suite_title ?? raw.suiteTitle);
  return {
    id: str(raw.id),
    title: str(raw.title ?? raw.name),
    description: str(raw.description),
    preconditions: str(raw.preconditions ?? raw.precondition),
    steps: formatted.steps,
    expectedResult: formatted.expectedResult,
    priority: namedEnum(str(raw.priority), QASE_PRIORITY),
    status: namedEnum(str(raw.status), QASE_STATUS),
    suite,
    tags: str(raw.tags),
    severity: str(raw.severity),
  };
}

function collectCases(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.map(asRecord).filter((row): row is Record<string, unknown> => Boolean(row));
  }
  const rec = asRecord(parsed);
  if (!rec) return [];
  const result = asRecord(rec.result);
  const entities = result?.entities ?? rec.entities ?? rec.cases;
  if (Array.isArray(entities)) {
    return entities
      .map(asRecord)
      .filter((row): row is Record<string, unknown> => Boolean(row));
  }
  return [];
}

function parseQaseJson(raw: string): Record<string, string>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Qase JSON could not be parsed");
  }
  return collectCases(parsed).map(flattenCase);
}

function parseQaseCsv(raw: string): Record<string, string>[] {
  return parseCsvTable(raw).rows.map((row) => {
    const formatted = parseStepsField(row.steps ?? row.Steps ?? "");
    return {
      ...row,
      steps: formatted.steps || row.steps || "",
      expectedResult: formatted.expectedResult || row.expectedResult || "",
    };
  });
}

export function parseQase(raw: string): ImportParseResult {
  const errors: string[] = [];
  const format = sniff(raw);
  let rows: Record<string, string>[] = [];
  try {
    rows = format === "json" ? parseQaseJson(raw) : parseQaseCsv(raw);
  } catch (err) {
    errors.push(err instanceof Error ? err.message : "Failed to parse Qase file");
  }
  const table: SourceTable = {
    provider: "qase",
    format,
    fields: uniqueFields(rows, [
      "id",
      "title",
      "description",
      "preconditions",
      "steps",
      "expectedResult",
      "priority",
      "status",
      "suite",
      "tags",
    ]),
    rows,
  };
  if (rows.length === 0 && errors.length === 0) {
    errors.push("No Qase cases found in the file");
  }
  return { table, suggestedMapping: suggestMapping(table.fields), errors };
}
