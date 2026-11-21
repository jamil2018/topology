import type { CsvCaseRow } from "@/lib/csv";
import { parseFallbackSteps } from "@/lib/tcm/steps";

export type CsvImportPreviewRow = {
  key: string;
  title: string;
  folder: string;
  priority: string;
  status: string;
  customFields?: Record<string, string>;
  structuredStepCount: number;
};

export function structuredStepCountForRow(row: CsvCaseRow): number {
  return parseFallbackSteps(row.steps ?? "", row.expectedResult ?? []).filter(
    (step) => step.action.trim() || step.expected.trim(),
  ).length;
}

export function buildCsvImportSample(
  rows: CsvCaseRow[],
  limit = 5,
): CsvImportPreviewRow[] {
  return rows.slice(0, limit).map((row) => ({
    key: row.key,
    title: row.title,
    folder: row.folder ?? "",
    priority: row.priority,
    status: row.status,
    ...(row.customFields && Object.keys(row.customFields).length > 0
      ? { customFields: row.customFields }
      : {}),
    structuredStepCount: structuredStepCountForRow(row),
  }));
}
