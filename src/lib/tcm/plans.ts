import { and, asc, eq, inArray } from "drizzle-orm";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@/db";
import {
  cases,
  environments,
  milestones,
  runs,
  testPlanCases,
  testPlans,
} from "@/db/schema";
import {
  fanOutMatrix,
  matrixCellLabel,
  parseMatrixJson,
  serializeMatrixJson,
  type PlanMatrixInput,
} from "@/lib/tcm/matrix";
import { seedManualRunResults } from "@/lib/tcm/seed-run";
import { lockCaseReviewPolicy } from "@/lib/case-review-policy";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const projectCaseIds = (workspaceId: string) =>
  db.select({ id: cases.id }).from(cases).where(eq(cases.workspaceId, workspaceId));

const planFields = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().optional(),
  milestoneId: z.uuid().nullable().optional(),
  matrix: z.object({
    browsers: z.array(z.string()).optional(),
    operatingSystems: z.array(z.string()).optional(),
    environmentIds: z.array(z.uuid()).optional(),
  }).optional(),
  caseIds: z.array(z.uuid()).optional(),
});

export const createPlanSchema = planFields;
export const updatePlanSchema = planFields.partial().extend({
  status: z.enum(["draft", "active", "completed", "archived"]).optional(),
});

export function planRevision(plan: typeof testPlans.$inferSelect, caseIds: readonly string[]) {
  return createHash("sha256").update(JSON.stringify([
    plan.id, plan.name, plan.description, plan.status, plan.milestoneId, plan.matrixJson, caseIds,
  ])).digest("hex");
}

async function invalidPlanSelection(
  workspaceId: string,
  input: { caseIds?: readonly string[]; milestoneId?: string | null; matrix?: PlanMatrixInput },
  tx: Transaction,
) {
  if (input.caseIds?.length) {
    const found = await tx.select({ id: cases.id }).from(cases).where(and(
      eq(cases.workspaceId, workspaceId), inArray(cases.id, input.caseIds),
    )).for("share");
    if (found.length !== input.caseIds.length) return "Select distinct cases from the current project";
  }
  if (input.milestoneId) {
    const [milestone] = await tx.select({ id: milestones.id }).from(milestones).where(and(
      eq(milestones.id, input.milestoneId), eq(milestones.workspaceId, workspaceId),
    )).for("share");
    if (!milestone) return "Select a milestone from the current project";
  }
  if (input.matrix?.environmentIds?.length) {
    const ids = [...new Set(input.matrix.environmentIds)];
    const found = await tx.select({ id: environments.id }).from(environments).where(and(
      eq(environments.workspaceId, workspaceId), inArray(environments.id, ids),
    )).for("share");
    if (found.length !== ids.length) return "Select environments from the current project";
  }
  return null;
}

type SavePlanInput = {
  workspaceId: string;
  actorId: string | null;
} & (
  | { planId?: undefined; data: z.input<typeof createPlanSchema>; revision?: undefined }
  | { planId: string; data: z.input<typeof updatePlanSchema>; revision?: string }
);

export function savePlan(input: SavePlanInput, tx?: Transaction) {
  return tx ? savePlanInTransaction(input, tx) : db.transaction((executor) => savePlanInTransaction(input, executor));
}

async function savePlanInTransaction(input: SavePlanInput, tx: Transaction) {
  const { workspaceId, actorId } = input;
  if (input.planId === undefined) {
    const invalid = await invalidPlanSelection(workspaceId, input.data, tx);
    if (invalid) return { ok: false as const, error: invalid, status: 400 };
    const { matrix, caseIds, ...fields } = input.data;
    const [plan] = await tx.insert(testPlans).values({
      ...fields, workspaceId, matrixJson: matrixFromBody(matrix ?? {}), createdById: actorId,
    }).returning();
    if (caseIds?.length) await replacePlanCases(plan.id, caseIds, tx);
    return { ok: true as const, plan };
  }

  const scope = and(eq(testPlans.id, input.planId), eq(testPlans.workspaceId, workspaceId));
  const [current] = await tx.select().from(testPlans).where(scope).for("update");
  if (!current) return { ok: false as const, error: "Plan not found", status: 404 };
  if (input.revision) {
    const linked = await tx.select({ id: testPlanCases.caseId }).from(testPlanCases)
      .where(eq(testPlanCases.planId, input.planId)).orderBy(asc(testPlanCases.position), asc(testPlanCases.caseId));
    if (planRevision(current, linked.map(({ id }) => id)) !== input.revision) {
      return { ok: false as const, error: "Plan changed. Refresh it and submit a new proposal", status: 409 };
    }
  }
  const invalid = await invalidPlanSelection(workspaceId, input.data, tx);
  if (invalid) return { ok: false as const, error: invalid, status: 400 };
  const { matrix, caseIds, ...fields } = input.data;
  const [plan] = await tx.update(testPlans).set({
    ...fields,
    matrixJson: matrix ? matrixFromBody(matrix) : undefined,
    updatedAt: new Date(),
  }).where(scope).returning();
  if (caseIds) await replacePlanCases(plan.id, caseIds, tx);
  return { ok: true as const, plan };
}

export async function listPlans(workspaceId: string) {
  const plans = await db.query.testPlans.findMany({
    where: eq(testPlans.workspaceId, workspaceId),
    orderBy: [asc(testPlans.name)],
    with: {
      cases: { where: inArray(testPlanCases.caseId, projectCaseIds(workspaceId)) },
      runs: true,
    },
  });
  return plans.map((plan) => ({
    ...plan,
    matrix: parseMatrixJson(plan.matrixJson),
    caseCount: plan.cases.length,
    runCount: plan.runs.length,
  }));
}

export async function getPlan(workspaceId: string, planId: string) {
  const plan = await db.query.testPlans.findFirst({
    where: and(eq(testPlans.id, planId), eq(testPlans.workspaceId, workspaceId)),
    with: {
      cases: {
        where: inArray(testPlanCases.caseId, projectCaseIds(workspaceId)),
        with: { case: true },
      },
      runs: true,
      milestone: true,
    },
  });
  if (!plan) return null;
  return {
    ...plan,
    cases: [...plan.cases].sort((a, b) => a.position - b.position),
    milestone: plan.milestone?.workspaceId === workspaceId ? plan.milestone : null,
    matrix: parseMatrixJson(plan.matrixJson),
  };
}

export async function replacePlanCases(planId: string, caseIds: readonly string[], executor: Transaction) {
  await executor.delete(testPlanCases).where(eq(testPlanCases.planId, planId));
  if (caseIds.length === 0) return;
  await executor.insert(testPlanCases).values(
    caseIds.map((caseId, position) => ({ planId, caseId, position })),
  );
}

type PlanLaunch = {
  workspaceId: string;
  planId: string;
  actorId: string;
  namePrefix?: string;
  assignedAgent?: boolean;
};

export function launchPlan(input: PlanLaunch, executor?: Transaction) {
  return executor ? launchPlanInTransaction(input, executor) : db.transaction((tx) => launchPlanInTransaction(input, tx));
}

async function launchPlanInTransaction(input: PlanLaunch, tx: Transaction) {
  const readyOnly = (await lockCaseReviewPolicy(tx, input.workspaceId)) || input.assignedAgent;
  const [plan] = await tx.select().from(testPlans).where(and(
    eq(testPlans.id, input.planId),
    eq(testPlans.workspaceId, input.workspaceId),
  )).for("update");
  if (!plan) return { ok: false as const, error: "Plan not found", status: 404 };
  if (input.assignedAgent && plan.status !== "active") {
    return { ok: false as const, error: "An agent can launch only an active plan", status: 409 };
  }
  const linked = await tx.select({ caseId: testPlanCases.caseId }).from(testPlanCases)
    .where(eq(testPlanCases.planId, plan.id)).orderBy(asc(testPlanCases.position));
  const caseIds = linked.map((row) => row.caseId);
  if (caseIds.length === 0) {
    return { ok: false as const, error: "Add at least one case before launching", status: 400 };
  }
  const found = await tx
    .select({ id: cases.id })
    .from(cases)
    .where(and(
      inArray(cases.id, caseIds), eq(cases.workspaceId, input.workspaceId),
      readyOnly ? eq(cases.status, "ready") : undefined,
    )).for("share");
  if (found.length !== caseIds.length) {
    return readyOnly
      ? { ok: false as const, error: "The plan must contain only ready project cases", status: 409 }
      : { ok: false as const, error: "One or more cases are invalid", status: 400 };
  }

  const matrix = parseMatrixJson(plan.matrixJson);
  const cells = fanOutMatrix(matrix);
  const envIds = [
    ...new Set(cells.map((c) => c.environmentId).filter(Boolean) as string[]),
  ];
  const envRows =
    envIds.length === 0
      ? []
      : await tx.query.environments.findMany({
          where: and(
            eq(environments.workspaceId, input.workspaceId),
            inArray(environments.id, envIds),
          ),
        });
  const envById = new Map(envRows.map((e) => [e.id, e]));
  if (input.assignedAgent && envById.size !== envIds.length) {
    return { ok: false as const, error: "A plan environment is no longer available", status: 409 };
  }

  const created: (typeof runs.$inferSelect)[] = [];
  const prefix = (input.namePrefix ?? plan.name).trim() || plan.name;
  for (const cell of cells) {
    const env = cell.environmentId ? envById.get(cell.environmentId) : null;
    const label = matrixCellLabel(cell);
    const [run] = await tx
      .insert(runs)
      .values({
        workspaceId: input.workspaceId,
        name: label === "default" ? prefix : `${prefix} · ${label}`,
        description: plan.description,
        status: "planned",
        kind: "manual",
        source: "plan",
        environment: env?.name ?? "local",
        environmentId: env?.id ?? null,
        planId: plan.id,
        matrixBrowser: cell.browser,
        matrixOs: cell.os,
        createdById: input.actorId,
        assigneeId: input.assignedAgent ? input.actorId : null,
      })
      .returning();
    await seedManualRunResults({
      workspaceId: input.workspaceId,
      runId: run.id,
      caseIds,
    }, tx);
    created.push(run);
  }

  await tx
    .update(testPlans)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(testPlans.id, plan.id));

  return { ok: true as const, runs: created };
}

export function matrixFromBody(body: PlanMatrixInput): string {
  return serializeMatrixJson(body);
}
