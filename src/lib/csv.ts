import { z } from "zod";

export const csvCaseRowSchema = z.object({
  key: z.string().min(1),
  title: z.string().min(1),
  description: z.string().optional().default(""),
  preconditions: z.string().optional().default(""),
  steps: z.string().optional().default(""),
  expectedResult: z.string().optional().default(""),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  status: z
    .enum(["draft", "ready", "blocked", "deprecated"])
    .optional()
    .default("draft"),
  folder: z.string().optional().default(""),
  tags: z.string().optional().default(""),
});

export type CsvCaseRow = z.infer<typeof csvCaseRowSchema>;

/**
 * Parse records without splitting on newlines first. A quoted field may
 * contain CR/LF; those bytes stay in the field so a continuation line is
 * not a new case.
 */
function parseCsvRecords(raw: string): string[][] {
  const text = raw.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [];
  let current = "";
  let inQuotes = false;

  const pushRow = () => {
    row.push(current);
    const cells = row.map((cell) => cell.trim());
    row = [];
    current = "";
    if (cells.length === 1 && cells[0] === "") return;
    records.push(cells);
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && (ch === "\n" || ch === "\r")) {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      pushRow();
      continue;
    }
    if (!inQuotes && ch === ",") {
      row.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  if (current.length > 0 || row.length > 0) pushRow();
  return records;
}

function normalizeHeader(header: string): string {
  const key = header.trim().toLowerCase().replace(/[\s_-]+/g, "");
  const map: Record<string, string> = {
    key: "key",
    id: "key",
    casekey: "key",
    title: "title",
    name: "title",
    description: "description",
    preconditions: "preconditions",
    steps: "steps",
    expected: "expectedResult",
    expectedresult: "expectedResult",
    priority: "priority",
    status: "status",
    folder: "folder",
    tags: "tags",
  };
  return map[key] ?? header.trim();
}

export function parseCasesCsv(raw: string): {
  rows: CsvCaseRow[];
  errors: string[];
} {
  const records = parseCsvRecords(raw);

  if (records.length < 2) {
    return { rows: [], errors: ["CSV must include a header and at least one row"] };
  }

  const headers = records[0].map(normalizeHeader);
  const rows: CsvCaseRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < records.length; i += 1) {
    const cells = records[i];
    const record: Record<string, string> = {};
    headers.forEach((header, idx) => {
      record[header] = cells[idx] ?? "";
    });

    const parsed = csvCaseRowSchema.safeParse(record);
    if (!parsed.success) {
      errors.push(`Row ${i + 1}: ${parsed.error.issues[0]?.message ?? "invalid"}`);
      continue;
    }
    rows.push(parsed.data);
  }

  return { rows, errors };
}

export function serializeCasesCsv(
  cases: Array<{
    key: string;
    title: string;
    description: string;
    preconditions: string;
    steps: string;
    expectedResult: string;
    priority: string;
    status: string;
    folderName?: string | null;
    tags: string[];
  }>,
): string {
  const header = [
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
  ];

  // Spreadsheets execute a cell that starts with these, even when quoted.
  // A leading apostrophe is a text marker; quoting alone is not.
  const FORMULA_START = /^[=+\-@]/;
  const escape = (value: string) => {
    const formula = FORMULA_START.test(value.trim());
    const safe = formula ? `'${value}` : value;
    if (formula || /[",\r\n]/.test(safe)) {
      return `"${safe.replace(/"/g, '""')}"`;
    }
    return safe;
  };

  const lines = [header.join(",")];
  for (const c of cases) {
    lines.push(
      [
        c.key,
        c.title,
        c.description,
        c.preconditions,
        c.steps,
        c.expectedResult,
        c.priority,
        c.status,
        c.folderName ?? "",
        c.tags.join(";"),
      ]
        .map(escape)
        .join(","),
    );
  }
  return `${lines.join("\n")}\n`;
}

export function buildCasesCsvTemplate(): string {
  return serializeCasesCsv([
    {
      key: "TOP-20",
      title: "CSV import lands cases",
      description: "Imported via the sample template",
      preconditions: "Signed in to Topology",
      steps: "1. Download template; 2. Fill rows; 3. Import CSV",
      expectedResult: "Cases appear under the chosen folder",
      priority: "P2",
      status: "ready",
      folderName: "Import",
      tags: ["csv", "import"],
    },
    {
      key: "TOP-21",
      title: "Folder filter works",
      description: "Chip filters narrow the cases table",
      preconditions: "",
      steps: "1. Open Cases; 2. Click a folder chip",
      expectedResult: "Table shows only cases in that folder",
      priority: "P3",
      status: "draft",
      folderName: "Import",
      tags: ["ui"],
    },
  ]);
}

