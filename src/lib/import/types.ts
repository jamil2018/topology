import type { CsvCaseRow } from "@/lib/csv";

export const IMPORT_PROVIDERS = [
  "testrail",
  "qase",
  "zephyr",
  "xray",
] as const;

export type ImportProvider = (typeof IMPORT_PROVIDERS)[number];

export const IMPORT_FORMATS = ["csv", "xml", "json"] as const;
export type ImportFormat = (typeof IMPORT_FORMATS)[number];

export const TOPOLOGY_CASE_FIELDS = [
  "key",
  "title",
  "description",
  "preconditions",
  "steps",
  "expectedResult",
  "priority",
  "status",
  "folder",
  "tags",
] as const;

export type TopologyCaseField = (typeof TOPOLOGY_CASE_FIELDS)[number];

export type FieldMapping = Partial<Record<TopologyCaseField, string>>;

export type SourceTable = {
  provider: ImportProvider;
  format: ImportFormat;
  fields: string[];
  rows: Record<string, string>[];
};

export type MappedCase = CsvCaseRow;

export type ImportParseResult = {
  table: SourceTable;
  suggestedMapping: FieldMapping;
  errors: string[];
};

export type MappingPreview = {
  provider: ImportProvider;
  format: ImportFormat;
  sourceFields: string[];
  suggestedMapping: FieldMapping;
  mapping: FieldMapping;
  sampleSourceRows: Record<string, string>[];
  sampleMappedRows: MappedCase[];
  counts: { total: number; valid: number; invalid: number };
  errors: string[];
};

export type ImportApiConfig = {
  baseUrl: string;
  token: string;
  email?: string;
  project?: string;
};

export const SAMPLE_ROW_LIMIT = 5;
