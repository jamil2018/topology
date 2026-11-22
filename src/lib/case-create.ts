import { eq } from "drizzle-orm";
import { z } from "zod";
import type { db } from "@/db";
import { cases } from "@/db/schema";
import { recordCaseActivity } from "@/lib/case-activity";
import { structuredStepInputSchema } from "@/lib/case-update";
import { ensureIntentForCase } from "@/lib/quality-graph/ensure";
import { replaceCaseSteps } from "@/lib/tcm/case-tcm";

export const createCaseSchema = z.object({
  structuredSteps: z.array(structuredStepInputSchema).max(500).optional(),
  key: z.string().min(1).max(64),
  title: z.string().min(1).max(240),
  description: z.string().optional().default(""),
  preconditions: z.string().optional().default(""),
  steps: z.string().optional().default(""),
  expectedResult: z.string().optional().default(""),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional().default("P2"),
  status: z
    .enum(["draft", "in_review", "ready", "blocked", "deprecated"])
    .optional()
    .default("draft"),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional().default([]),
  assigneeId: z.string().uuid().nullable().optional(),
});

export async function persistCase(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  workspaceId: string,
  actorId: string | null,
  input: z.infer<typeof createCaseSchema>,
) {
  const { structuredSteps, ...fields } = input;
  const [created] = await tx.insert(cases).values({
    ...fields,
    workspaceId,
    createdById: actorId,
  }).returning();
  if (structuredSteps) {
    await replaceCaseSteps({ workspaceId, caseId: created.id, steps: structuredSteps }, tx);
  }
  const { intentId } = await ensureIntentForCase(created, tx);
  await recordCaseActivity({
    caseId: created.id,
    actorId,
    action: "created",
    summary: `Created case ${created.key}`,
  }, tx);
  const current = await tx.query.cases.findFirst({ where: eq(cases.id, created.id) });
  return { ...current!, intentId };
}
