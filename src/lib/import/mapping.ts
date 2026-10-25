import { csvCaseRowSchema, type CsvCaseRow } from "@/lib/csv";
import {
  SAMPLE_ROW_LIMIT,
  TOPOLOGY_CASE_FIELDS,
  type FieldMapping,
  type ImportProvider,
  type MappedCase,
  type MappingPreview,
  type SourceTable,
  type TopologyCaseField,
} from "./types";

export function normalizeFieldName(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const FIELD_ALIASES: Record<TopologyCaseField, string[]> = {
  key: [
    "key",
    "id",
    "caseid",
    "casekey",
    "issuekey",
    "testid",
    "testkey",
    "entityid",
  ],
  title: ["title", "name", "summary", "casename", "testname"],
  description: [
    "description",
    "objective",
    "goals",
    "details",
    "comment",
    "comments",
  ],
  preconditions: [
    "preconditions",
    "precondition",
    "preconds",
    "precond",
    "custompreconds",
  ],
  steps: [
    "steps",
    "step",
    "action",
    "actions",
    "content",
    "stepsstep",
    "testscriptstepbystepstep",
    "testscriptplaintext",
    "customsteps",
  ],
  expectedResult: [
    "expectedresult",
    "expected",
    "expectedresults",
    "result",
    "stepsexpectedresult",
    "testscriptstepbystepexpectedresult",
    "customexpected",
  ],
  priority: ["priority", "severity", "priorityid", "priorityname"],
  status: ["status", "state", "casestatus"],
  folder: [
    "folder",
    "section",
    "sectionhierarchy",
    "suite",
    "suitetitle",
    "path",
    "testrepositorypath",
    "sectionname",
  ],
  tags: ["tags", "labels", "refs", "references", "label"],
};

const PRIORITY_MAP: Record<string, CsvCaseRow["priority"]> = {
  p0: "P0",
  p1: "P1",
  p2: "P2",
  p3: "P3",
  critical: "P0",
  blocker: "P0",
  highest: "P0",
  high: "P1",
  major: "P1",
  medium: "P2",
  normal: "P2",
  moderate: "P2",
  low: "P3",
  lowest: "P3",
  minor: "P3",
  trivial: "P3",
  "1": "P3",
  "2": "P2",
  "3": "P1",
  "4": "P0",
};

const STATUS_MAP: Record<string, CsvCaseRow["status"]> = {
  draft: "draft",
  ready: "ready",
  published: "ready",
  approved: "ready",
  actual: "ready",
  review: "ready",
  active: "ready",
  blocked: "blocked",
  deprecated: "deprecated",
  outdated: "deprecated",
  inactive: "deprecated",
  "0": "ready",
  "1": "draft",
  "2": "deprecated",
};

const PROVIDER_KEY_PREFIX: Record<ImportProvider, string> = {
  testrail: "TR",
  qase: "QS",
  zephyr: "ZE",
  xray: "XR",
};

export function lookupField(
  row: Record<string, string>,
  source: string,
): string {
  if (Object.prototype.hasOwnProperty.call(row, source)) {
    return row[source] ?? "";
  }
  const want = normalizeFieldName(source);
  for (const [key, value] of Object.entries(row)) {
    if (normalizeFieldName(key) === want) return value ?? "";
  }
  return "";
}

export function suggestMapping(fields: string[]): FieldMapping {
  const mapping: FieldMapping = {};
  const normalized = fields.map((field) => ({
    field,
    key: normalizeFieldName(field),
  }));
  for (const topo of TOPOLOGY_CASE_FIELDS) {
    for (const alias of FIELD_ALIASES[topo]) {
      const match = normalized.find((item) => item.key === alias);
      if (match) {
        mapping[topo] = match.field;
        break;
      }
    }
  }
  return mapping;
}

export function normalizePriority(raw: string): CsvCaseRow["priority"] {
  const key = raw.trim().toLowerCase();
  if (!key) return "P2";
  if (key in PRIORITY_MAP) return PRIORITY_MAP[key]!;
  const compact = key.replace(/[^a-z0-9]/g, "");
  return PRIORITY_MAP[compact] ?? "P2";
}

export function normalizeStatus(raw: string): CsvCaseRow["status"] {
  const key = raw.trim().toLowerCase();
  if (!key) return "draft";
  if (key in STATUS_MAP) return STATUS_MAP[key]!;
  const compact = key.replace(/[^a-z0-9]/g, "");
  return STATUS_MAP[compact] ?? "draft";
}

export function joinTags(raw: string): string {
  return raw
    .split(/[;,]/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .join(";");
}

function mapOneRow(
  row: Record<string, string>,
  mapping: FieldMapping,
  index: number,
  prefix: string,
): { row: MappedCase } | { error: string } {
  const get = (field: TopologyCaseField) => {
    const source = mapping[field];
    if (!source) return "";
    return lookupField(row, source);
  };

  const title = get("title").trim();
  if (!title) {
    return { error: `Row ${index}: title is required` };
  }

  let key = get("key").trim();
  if (!key) key = `${prefix}-${index}`;

  const parsed = csvCaseRowSchema.safeParse({
    key,
    title,
    description: get("description"),
    preconditions: get("preconditions"),
    steps: get("steps"),
    expectedResult: get("expectedResult"),
    priority: normalizePriority(get("priority")),
    status: normalizeStatus(get("status")),
    folder: get("folder").trim(),
    tags: joinTags(get("tags")),
  });
  if (!parsed.success) {
    return {
      error: `Row ${index}: ${parsed.error.issues[0]?.message ?? "invalid"}`,
    };
  }
  return { row: parsed.data };
}

export function applyMapping(
  table: SourceTable,
  mapping: FieldMapping,
): { rows: MappedCase[]; errors: string[] } {
  const prefix = PROVIDER_KEY_PREFIX[table.provider];
  const rows: MappedCase[] = [];
  const errors: string[] = [];
  table.rows.forEach((source, idx) => {
    const result = mapOneRow(source, mapping, idx + 1, prefix);
    if ("error" in result) {
      errors.push(result.error);
      return;
    }
    rows.push(result.row);
  });
  return { rows, errors };
}

export function buildMappingPreview(
  table: SourceTable,
  mapping?: FieldMapping,
  parseErrors: string[] = [],
): MappingPreview {
  const suggestedMapping = suggestMapping(table.fields);
  const resolved = mapping && Object.keys(mapping).length > 0
    ? mapping
    : suggestedMapping;
  const applied = applyMapping(table, resolved);
  return {
    provider: table.provider,
    format: table.format,
    sourceFields: table.fields,
    suggestedMapping,
    mapping: resolved,
    sampleSourceRows: table.rows.slice(0, SAMPLE_ROW_LIMIT),
    sampleMappedRows: applied.rows.slice(0, SAMPLE_ROW_LIMIT),
    counts: {
      total: table.rows.length,
      valid: applied.rows.length,
      invalid: applied.errors.length,
    },
    errors: [...parseErrors, ...applied.errors],
  };
}
