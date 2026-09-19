import { db } from "@/db";
import { caseActivities } from "@/db/schema";
import {
  describeCaseChange,
  stringifyActivityValue,
} from "@/lib/case-activity-format";

export type CaseActivityField =
  | "status"
  | "priority"
  | "folderId"
  | "tags"
  | "title"
  | "key"
  | "description"
  | "steps"
  | "preconditions"
  | "expectedResult";

export { describeCaseChange } from "@/lib/case-activity-format";

export async function recordCaseActivity(input: {
  caseId: string;
  actorId?: string | null;
  action: string;
  field?: string | null;
  fromValue?: unknown;
  toValue?: unknown;
  summary: string;
  generatedBy?: string | null;
  model?: string | null;
  approvedById?: string | null;
}) {
  const [row] = await db
    .insert(caseActivities)
    .values({
      caseId: input.caseId,
      actorId: input.actorId ?? null,
      action: input.action,
      field: input.field ?? null,
      fromValue: stringifyActivityValue(input.fromValue),
      toValue: stringifyActivityValue(input.toValue),
      summary: input.summary,
      generatedBy: input.generatedBy ?? null,
      model: input.model ?? null,
      approvedById: input.approvedById ?? null,
    })
    .returning();
  return row;
}

export async function recordCaseFieldChanges(input: {
  caseId: string;
  actorId?: string | null;
  action?: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  fields: string[];
}) {
  const action = input.action ?? "updated";
  const rows = [];
  for (const field of input.fields) {
    const fromValue = input.before[field];
    const toValue = input.after[field];
    const fromStr = stringifyActivityValue(fromValue);
    const toStr = stringifyActivityValue(toValue);
    if (fromStr === toStr) continue;
    rows.push(
      await recordCaseActivity({
        caseId: input.caseId,
        actorId: input.actorId,
        action,
        field,
        fromValue,
        toValue,
        summary: describeCaseChange(field, fromValue, toValue),
      }),
    );
  }
  return rows;
}
