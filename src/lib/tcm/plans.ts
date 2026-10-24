import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  cases,
  environments,
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

export async function listPlans(workspaceId: string) {
  const plans = await db.query.testPlans.findMany({
    where: eq(testPlans.workspaceId, workspaceId),
    orderBy: [asc(testPlans.name)],
    with: { cases: true, runs: true },
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
    matrix: parseMatrixJson(plan.matrixJson),
  };
}

export async function replacePlanCases(planId: string, caseIds: readonly string[]) {
  await db.delete(testPlanCases).where(eq(testPlanCases.planId, planId));
  if (caseIds.length === 0) return;
  await db.insert(testPlanCases).values(
    caseIds.map((caseId, position) => ({ planId, caseId, position })),
  );
}

export async function launchPlan(input: {
  workspaceId: string;
  planId: string;
  actorId: string;
  namePrefix?: string;
}) {
  const plan = await db.query.testPlans.findFirst({
    where: and(
      eq(testPlans.id, input.planId),
      eq(testPlans.workspaceId, input.workspaceId),
    ),
    with: { cases: true },
  });
  if (!plan) return { ok: false as const, error: "Plan not found", status: 404 };
  const caseIds = [...plan.cases]
    .sort((a, b) => a.position - b.position)
    .map((row) => row.caseId);
  if (caseIds.length === 0) {
    return { ok: false as const, error: "Add at least one case before launching", status: 400 };
  }
  const found = await db
    .select({ id: cases.id })
    .from(cases)
    .where(and(inArray(cases.id, caseIds), eq(cases.workspaceId, input.workspaceId)));
  if (found.length !== caseIds.length) {
    return { ok: false as const, error: "One or more cases are invalid", status: 400 };
  }

  const matrix = parseMatrixJson(plan.matrixJson);
  const cells = fanOutMatrix(matrix);
  const envIds = [
    ...new Set(cells.map((c) => c.environmentId).filter(Boolean) as string[]),
  ];
  const envRows =
    envIds.length === 0
      ? []
      : await db.query.environments.findMany({
          where: and(
            eq(environments.workspaceId, input.workspaceId),
            inArray(environments.id, envIds),
          ),
        });
  const envById = new Map(envRows.map((e) => [e.id, e]));

  const created: (typeof runs.$inferSelect)[] = [];
  const prefix = (input.namePrefix ?? plan.name).trim() || plan.name;
  for (const cell of cells) {
    const env = cell.environmentId ? envById.get(cell.environmentId) : null;
    const label = matrixCellLabel(cell);
    const [run] = await db
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
      })
      .returning();
    await seedManualRunResults({
      workspaceId: input.workspaceId,
      runId: run.id,
      caseIds,
    });
    created.push(run);
  }

  await db
    .update(testPlans)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(testPlans.id, plan.id));

  return { ok: true as const, runs: created };
}

export function matrixFromBody(body: PlanMatrixInput): string {
  return serializeMatrixJson(body);
}
