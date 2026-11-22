import { and, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { db } from "@/db";
import { cases, runTemplates } from "@/db/schema";
import { requireWorkspaceAssignee } from "@/lib/assignee";
import type { RunTemplateInput } from "./run-template";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function validateTemplateReferences(workspaceId: string, input: RunTemplateInput, tx?: Transaction) {
  const query = (tx ?? db).select({ id: cases.id }).from(cases)
    .where(and(eq(cases.workspaceId, workspaceId), inArray(cases.id, input.caseIds)));
  const found = await (tx ? query.for("share") : query);
  if (found.length !== input.caseIds.length) return "Some selected cases are unavailable. Update the selection before saving.";
  if (input.assigneeId) {
    const assignee = await requireWorkspaceAssignee(workspaceId, input.assigneeId, "runs.edit", tx);
    if (!assignee.ok) return "The default assignee is unavailable. Choose another member.";
  }
  return null;
}

export function runTemplateRevision(template: typeof runTemplates.$inferSelect) {
  return createHash("sha256").update(JSON.stringify([
    template.id, template.name, template.description, template.caseIds, template.environment, template.assigneeId,
  ])).digest("hex");
}

type SaveTemplateInput = {
  workspaceId: string;
  actorId: string | null;
  data: RunTemplateInput;
  templateId?: string;
  revision?: string;
  canEditAny?: boolean;
};

export function saveRunTemplate(input: SaveTemplateInput, tx?: Transaction) {
  return tx ? saveInTransaction(input, tx) : db.transaction((executor) => saveInTransaction(input, executor));
}

async function saveInTransaction(input: SaveTemplateInput, tx: Transaction) {
  const { workspaceId, actorId, templateId, data } = input;
  if (templateId) {
    const scope = and(eq(runTemplates.workspaceId, workspaceId), eq(runTemplates.id, templateId));
    const [current] = await tx.select().from(runTemplates).where(scope).for("update");
    if (!current) return { ok: false as const, error: "Template not found", status: 404 };
    if (!input.canEditAny && current.createdById !== actorId) {
      return { ok: false as const, error: "Only the owner or a project admin can edit this template", status: 403 };
    }
    if (input.revision && runTemplateRevision(current) !== input.revision) {
      return { ok: false as const, error: "Template changed. Refresh it and submit a new proposal", status: 409 };
    }
    const invalid = await validateTemplateReferences(workspaceId, data, tx);
    if (invalid) return { ok: false as const, error: invalid, status: 400 };
    const [template] = await tx.update(runTemplates).set({ ...data, updatedAt: new Date() }).where(scope).returning();
    return { ok: true as const, template };
  }
  const invalid = await validateTemplateReferences(workspaceId, data, tx);
  if (invalid) return { ok: false as const, error: invalid, status: 400 };
  const [template] = await tx.insert(runTemplates).values({ ...data, workspaceId, createdById: actorId }).returning();
  return { ok: true as const, template };
}
