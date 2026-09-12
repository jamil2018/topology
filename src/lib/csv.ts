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

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current);
  return cells.map((c) => c.trim());
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
  const lines = raw
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0);

  if (lines.length < 2) {
    return { rows: [], errors: ["CSV must include a header and at least one row"] };
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const rows: CsvCaseRow[] = [];
  const errors: string[] = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cells = splitCsvLine(lines[i]);
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

  const escape = (value: string) => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
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

