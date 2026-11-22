import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { ProposalPayload } from "@topology/domain";
import { db } from "@/db";
import { auditEvents, runResults, runs } from "@/db/schema";
import { createCaseSchema } from "@/lib/case-create";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export const exploratorySessionSchema = z.object({
  name: z.string().trim().min(1).max(200),
  charter: z.string().trim().min(1).max(10_000),
  environment: z.string().trim().min(1).max(120).default("local"),
});

export const exploratorySourceSchema = z.object({ runId: z.uuid(), resultId: z.uuid() });

export async function createExploratorySession(
  input: z.infer<typeof exploratorySessionSchema> & { workspaceId: string; actorId: string },
  tx?: Transaction,
) {
  async function create(executor: Transaction) {
    const [run] = await executor.insert(runs).values({
      workspaceId: input.workspaceId,
      name: input.name,
      description: input.charter,
      environment: input.environment,
      source: "exploratory",
      createdById: input.actorId,
      assigneeId: input.actorId,
    }).returning();
    const [result] = await executor.insert(runResults).values({
      runId: run.id,
      externalKey: "EXPLORATION",
      title: "Exploratory findings",
    }).returning();
    return { run, resultId: result.id, href: `/runs/${run.id}` };
  }

  if (tx) return create(tx);
  return db.transaction(async (executor) => {
    const session = await create(executor);
    await executor.insert(auditEvents).values({
      workspaceId: input.workspaceId, actorId: input.actorId,
      action: "exploratory_session.created",
      targetType: "run", targetId: session.run.id,
    });
    return session;
  });
}

export async function readExploratorySession(workspaceId: string, id: string) {
  const row = await db.query.runs.findFirst({
    where: and(eq(runs.id, id), eq(runs.workspaceId, workspaceId), eq(runs.source, "exploratory")),
    with: { results: { columns: { id: true, status: true }, limit: 1 } },
  });
  if (!row) return null;
  const { results, ...run } = row;
  return { run, result: results[0] ?? null, href: `/runs/${run.id}` };
}

export async function exploratoryProposalRefs(
  workspaceId: string,
  source: z.infer<typeof exploratorySourceSchema>,
  payload: ProposalPayload,
  tx?: Transaction,
) {
  if (!payload.diffs.every((diff) =>
    diff.entityType === "case" && diff.action === "create" &&
    createCaseSchema.safeParse({ ...diff.after, status: "ready", assigneeId: null }).success
  )) return null;
  const [finding] = await (tx ?? db).select({ id: runResults.id })
    .from(runResults).innerJoin(runs, eq(runResults.runId, runs.id))
    .where(and(
      eq(runs.workspaceId, workspaceId),
      eq(runs.source, "exploratory"),
      eq(runs.id, source.runId),
      eq(runResults.id, source.resultId),
    ));
  return finding ? [`/runs/${source.runId}`, `result:${finding.id}`] : null;
}
