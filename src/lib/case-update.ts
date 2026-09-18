import { z } from "zod";

export const updateCaseSchema = z
  .object({
    title: z.string().trim().min(1).max(240).optional(),
    description: z.string().optional(),
    preconditions: z.string().optional(),
    steps: z.string().optional(),
    expectedResult: z.string().optional(),
    priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
    status: z
      .enum(["draft", "ready", "blocked", "deprecated"])
      .optional(),
    folderId: z.string().uuid().nullable().optional(),
    tags: z.array(z.string().trim().min(1)).optional(),
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.preconditions !== undefined ||
      v.steps !== undefined ||
      v.expectedResult !== undefined ||
      v.priority !== undefined ||
      v.status !== undefined ||
      v.folderId !== undefined ||
      v.tags !== undefined,
    { message: "Provide at least one field to update" },
  );

export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

export type CaseUpdateSnapshot = {
  title: string;
  description: string;
  preconditions: string;
  steps: string;
  expectedResult: string;
  priority: "P0" | "P1" | "P2" | "P3" | string;
  status: "draft" | "ready" | "blocked" | "deprecated" | string;
  folderId: string | null;
  tags: string[];
};

export type CasePatchResult = {
  patch: Partial<CaseUpdateSnapshot> & { updatedAt?: Date };
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  fields: string[];
};

/** Preserve existing tag order, then append new tags. Duplicates are dropped. */
export function unionTags(
  existing: readonly string[] | null | undefined,
  additions: readonly string[],
): string[] {
  return Array.from(new Set([...(existing ?? []), ...additions]));
}

function tagsEqual(a: string[], b: string[]) {
  return (
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  );
}

/** Diff an update payload against the current case; empty fields means no-op. */
export function buildCasePatch(
  existing: CaseUpdateSnapshot,
  input: UpdateCaseInput,
  folderNameById?: Map<string, string>,
): CasePatchResult {
  const patch: CasePatchResult["patch"] = {};
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  const fields: string[] = [];

  const setField = (
    field: keyof CaseUpdateSnapshot,
    next: CaseUpdateSnapshot[keyof CaseUpdateSnapshot],
    activityBefore: unknown = existing[field],
    activityAfter: unknown = next,
  ) => {
    before[field] = activityBefore;
    after[field] = activityAfter;
    (patch as Record<string, unknown>)[field] = next;
    fields.push(field);
  };

  if (input.title !== undefined && input.title !== existing.title) {
    setField("title", input.title);
  }
  if (
    input.description !== undefined &&
    input.description !== existing.description
  ) {
    setField("description", input.description);
  }
  if (
    input.preconditions !== undefined &&
    input.preconditions !== existing.preconditions
  ) {
    setField("preconditions", input.preconditions);
  }
  if (input.steps !== undefined && input.steps !== existing.steps) {
    setField("steps", input.steps);
  }
  if (
    input.expectedResult !== undefined &&
    input.expectedResult !== existing.expectedResult
  ) {
    setField("expectedResult", input.expectedResult);
  }
  if (input.priority !== undefined && input.priority !== existing.priority) {
    setField("priority", input.priority);
  }
  if (input.status !== undefined && input.status !== existing.status) {
    setField("status", input.status);
  }
  if (input.folderId !== undefined && input.folderId !== existing.folderId) {
    const fromLabel = existing.folderId
      ? (folderNameById?.get(existing.folderId) ?? existing.folderId)
      : "unfiled";
    const toLabel = input.folderId
      ? (folderNameById?.get(input.folderId) ?? input.folderId)
      : "unfiled";
    setField("folderId", input.folderId, fromLabel, toLabel);
  }
  if (input.tags !== undefined && !tagsEqual(existing.tags, input.tags)) {
    setField("tags", input.tags);
  }

  return { patch, before, after, fields };
}
