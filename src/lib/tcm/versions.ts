import type { OrderedStep } from "./steps";

export type CaseParameterSnapshot = {
  name: string;
  defaultValue: string;
  position: number;
};

export type CaseDatasetRowSnapshot = {
  position: number;
  values: Record<string, string>;
};

export type CaseVersionSnapshot = {
  title: string;
  description: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  priority: string;
  status: string;
  tags: string[];
  folderId: string | null;
  structuredSteps: OrderedStep[];
  parameters: CaseParameterSnapshot[];
  datasets: CaseDatasetRowSnapshot[];
  customFields: Record<string, unknown>;
};

export type VersionDiff = {
  field: string;
  from: unknown;
  to: unknown;
};

const SCALAR_FIELDS = [
  "title",
  "description",
  "preconditions",
  "steps",
  "expectedResult",
  "priority",
  "status",
  "folderId",
] as const;

function stable(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(
        Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
          a.localeCompare(b),
        ),
      );
    }
    return v;
  });
}

export function emptyCaseSnapshot(): CaseVersionSnapshot {
  return {
    title: "",
    description: "",
    preconditions: "",
    steps: "",
    expectedResult: "",
    priority: "P2",
    status: "draft",
    tags: [],
    folderId: null,
    structuredSteps: [],
    parameters: [],
    datasets: [],
    customFields: {},
  };
}

export function parseCaseSnapshot(raw: string): CaseVersionSnapshot {
  try {
    const parsed = JSON.parse(raw) as Partial<CaseVersionSnapshot>;
    return {
      ...emptyCaseSnapshot(),
      ...parsed,
      tags: Array.isArray(parsed.tags) ? parsed.tags.map(String) : [],
      structuredSteps: Array.isArray(parsed.structuredSteps)
        ? parsed.structuredSteps
        : [],
      parameters: Array.isArray(parsed.parameters) ? parsed.parameters : [],
      datasets: Array.isArray(parsed.datasets) ? parsed.datasets : [],
      customFields:
        parsed.customFields && typeof parsed.customFields === "object"
          ? parsed.customFields
          : {},
    };
  } catch {
    return emptyCaseSnapshot();
  }
}

export function diffSnapshots(
  from: CaseVersionSnapshot,
  to: CaseVersionSnapshot,
): VersionDiff[] {
  const diffs: VersionDiff[] = [];
  for (const field of SCALAR_FIELDS) {
    if (from[field] !== to[field]) {
      diffs.push({ field, from: from[field], to: to[field] });
    }
  }
  if (stable(from.tags) !== stable(to.tags)) {
    diffs.push({ field: "tags", from: from.tags, to: to.tags });
  }
  if (stable(from.structuredSteps) !== stable(to.structuredSteps)) {
    diffs.push({
      field: "structuredSteps",
      from: from.structuredSteps,
      to: to.structuredSteps,
    });
  }
  if (stable(from.parameters) !== stable(to.parameters)) {
    diffs.push({ field: "parameters", from: from.parameters, to: to.parameters });
  }
  if (stable(from.datasets) !== stable(to.datasets)) {
    diffs.push({ field: "datasets", from: from.datasets, to: to.datasets });
  }
  if (stable(from.customFields) !== stable(to.customFields)) {
    diffs.push({
      field: "customFields",
      from: from.customFields,
      to: to.customFields,
    });
  }
  return diffs;
}

/** Fields to write back onto the case row when restoring a snapshot. */
export function restoreCasePatch(snapshot: CaseVersionSnapshot): {
  title: string;
  description: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  priority: string;
  status: string;
  tags: string[];
  folderId: string | null;
} {
  return {
    title: snapshot.title,
    description: snapshot.description,
    preconditions: snapshot.preconditions,
    steps: snapshot.steps,
    expectedResult: snapshot.expectedResult,
    priority: snapshot.priority,
    status: snapshot.status,
    tags: [...snapshot.tags],
    folderId: snapshot.folderId,
  };
}
