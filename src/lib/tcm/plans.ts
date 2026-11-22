import { and, asc, eq, inArray } from "drizzle-orm";
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

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

const projectCaseIds = (workspaceId: string) =>
  db.select({ id: cases.id }).from(cases).where(eq(cases.workspaceId, workspaceId));

export async function invalidPlanSelection(
  workspaceId: string,
  input: { caseIds?: readonly string[]; milestoneId?: string | null },
) {
  if (input.caseIds?.length) {
    const found = await db.select({ id: cases.id }).from(cases).where(and(
      eq(cases.workspaceId, workspaceId), inArray(cases.id, input.caseIds),
    ));
    if (found.length !== input.caseIds.length) return "Select distinct cases from the current project";
  }
  if (input.milestoneId) {
    const milestone = await db.query.milestones.findFirst({ where: and(eq(milestones.id, input.milestoneId), eq(milestones.workspaceId, workspaceId)) });
    if (!milestone) return "Select a milestone from the current project";
  }
  return null;
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
      input.assignedAgent ? eq(cases.status, "ready") : undefined,
    )).for("share");
  if (found.length !== caseIds.length) {
    return input.assignedAgent
      ? { ok: false as const, error: "An agent plan must contain only ready project cases", status: 409 }
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
