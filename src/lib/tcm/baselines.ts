import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  auditEvents, cases, environments, regressionBaselines, runResults, runs, runStepResults, testPlanCases, testPlans,
} from "@/db/schema";
import { readCaseRevision } from "@/lib/case-revision";
import { loadCaseIterations } from "@/lib/tcm/case-tcm";
import { fanOutMatrix, matrixCellLabel, parseMatrixJson } from "@/lib/tcm/matrix";
import { applyParametersToSteps } from "@/lib/tcm/steps";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Baseline = typeof regressionBaselines.$inferSelect;

export class BaselineError extends Error {
  constructor(readonly status: 404 | 409, message: string) {
    super(message);
  }
}

export function listRegressionBaselines(input: { workspaceId: string; planId?: string; before?: string; limit: number }) {
  const order = input.planId ? [desc(regressionBaselines.createdAt), desc(regressionBaselines.id)] : [desc(regressionBaselines.id)];
  return db.select({
    id: regressionBaselines.id,
    name: regressionBaselines.name,
    planId: regressionBaselines.planId,
    createdAt: regressionBaselines.createdAt,
    caseCount: sql<number>`jsonb_array_length(${regressionBaselines.caseSnapshots})`,
    runCount: sql<number>`jsonb_array_length(${regressionBaselines.cells})`,
  }).from(regressionBaselines).where(and(
    eq(regressionBaselines.workspaceId, input.workspaceId),
    input.planId ? eq(regressionBaselines.planId, input.planId) : undefined,
    input.before ? lt(regressionBaselines.id, input.before) : undefined,
  )).orderBy(...order).limit(input.limit);
}

export function readRegressionBaseline(workspaceId: string, id: string, executor: Pick<typeof db, "query"> = db) {
  return executor.query.regressionBaselines.findFirst({ where: and(
    eq(regressionBaselines.workspaceId, workspaceId), eq(regressionBaselines.id, id),
  ) });
}

export async function captureRegressionBaseline(input: { workspaceId: string; planId: string; actorId: string; name?: string }) {
  const { workspaceId, planId, actorId } = input;
  return db.transaction(async (tx) => {
    const plan = await tx.query.testPlans.findFirst({
      where: and(eq(testPlans.id, planId), eq(testPlans.workspaceId, workspaceId)),
    });
    if (!plan) throw new BaselineError(404, "Plan not found");

    const linked = await tx.select({ id: cases.id, key: cases.key, status: cases.status })
      .from(testPlanCases).leftJoin(cases, and(eq(testPlanCases.caseId, cases.id), eq(cases.workspaceId, workspaceId)))
      .where(eq(testPlanCases.planId, planId)).orderBy(asc(testPlanCases.position));
    if (!linked.length) throw new BaselineError(409, "Add ready cases to the plan before saving a baseline");

    const snapshots: Baseline["caseSnapshots"] = [];
    for (const row of linked) {
      if (!row.id || !row.key || row.status !== "ready") {
        throw new BaselineError(409, "A baseline can contain only ready project cases");
      }
      const pinned = await readCaseRevision(workspaceId, row.id, tx);
      if (!pinned) throw new BaselineError(409, "A plan case is no longer available");
      const { title, steps, expectedResult } = pinned.definition;
      const iterations = await loadCaseIterations(row.id, tx);
      snapshots.push({
        case: { id: row.id, key: row.key, title, steps, expectedResult },
        definition: pinned.definition,
        revision: pinned.revision,
        iterations: iterations.map(({ index, values }) => ({
          index, values,
          steps: applyParametersToSteps(pinned.steps, values).map(({ position, action, expected, data }) => ({
            position, action, expected, data,
          })),
        })),
      });
    }

    const matrix = fanOutMatrix(parseMatrixJson(plan.matrixJson));
    const ids = [...new Set(matrix.flatMap((cell) => cell.environmentId ? [cell.environmentId] : []))];
    const envs = ids.length ? await tx.select({ id: environments.id, name: environments.name }).from(environments)
      .where(and(eq(environments.workspaceId, workspaceId), inArray(environments.id, ids))) : [];
    const names = new Map(envs.map(({ id, name }) => [id, name]));
    if (names.size !== ids.length) throw new BaselineError(409, "A plan environment is no longer available");
    const cells = matrix.map((cell) => ({ ...cell, environment: names.get(cell.environmentId ?? "") ?? "local" }));

    const [baseline] = await tx.insert(regressionBaselines).values({
      workspaceId, planId, createdById: actorId, name: input.name ?? `${plan.name} baseline`,
      description: plan.description, caseSnapshots: snapshots, cells,
    }).returning();
    await tx.insert(auditEvents).values({
      workspaceId, actorId, action: "baseline.capture", targetType: "regression_baseline", targetId: baseline.id,
      metadataJson: JSON.stringify({ planId, caseCount: snapshots.length, runCount: cells.length }),
    });
    return { id: baseline.id, name: baseline.name, createdAt: baseline.createdAt, caseCount: snapshots.length, runCount: cells.length };
  }, { isolationLevel: "repeatable read" });
}

type LaunchInput = { workspaceId: string; baselineId: string; actorId: string; namePrefix?: string; assignedAgent?: boolean };

export function launchRegressionBaseline(input: LaunchInput, executor?: Transaction) {
  return executor ? launchBaseline(input, executor) : db.transaction(async (tx) => {
    const launched = await launchBaseline(input, tx);
    await tx.insert(auditEvents).values({
      workspaceId: input.workspaceId, actorId: input.actorId, action: "baseline.launch",
      targetType: "regression_baseline", targetId: input.baselineId,
      metadataJson: JSON.stringify({ runs: launched.map(({ id }) => id) }),
    });
    return launched;
  });
}

async function launchBaseline(input: LaunchInput, tx: Transaction) {
  const { workspaceId, actorId, baselineId } = input;
  const baseline = await readRegressionBaseline(workspaceId, baselineId, tx);
  if (!baseline) throw new BaselineError(404, "Baseline not found");

  const caseIds = baseline.caseSnapshots.map(({ case: snapshot }) => snapshot.id);
  const envIds = [...new Set(baseline.cells.flatMap(({ environmentId }) => environmentId ? [environmentId] : []))];
  const liveCases = await tx.select({ id: cases.id }).from(cases)
    .where(and(eq(cases.workspaceId, workspaceId), inArray(cases.id, caseIds))).for("share");
  const liveEnvs = envIds.length ? await tx.select({ id: environments.id }).from(environments)
    .where(and(eq(environments.workspaceId, workspaceId), inArray(environments.id, envIds))).for("share") : [];
  const existingCases = new Set(liveCases.map(({ id }) => id));
  const existingEnvs = new Set(liveEnvs.map(({ id }) => id));

  const created: (typeof runs.$inferSelect)[] = [];
  for (const cell of baseline.cells) {
    const label = matrixCellLabel(cell);
    const prefix = input.namePrefix ?? baseline.name;
    const [run] = await tx.insert(runs).values({
      workspaceId, baselineId, planId: baseline.planId,
      name: label === "default" ? prefix : `${prefix} · ${label}`,
      description: baseline.description, source: "baseline", createdById: actorId,
      assigneeId: input.assignedAgent ? actorId : null,
      environment: cell.environment,
      environmentId: cell.environmentId && existingEnvs.has(cell.environmentId) ? cell.environmentId : null,
      matrixBrowser: cell.browser, matrixOs: cell.os,
    }).returning();
    for (const { case: snapshot, revision, iterations } of baseline.caseSnapshots) {
      for (const iteration of iterations) {
        const [result] = await tx.insert(runResults).values({
          runId: run.id, caseId: existingCases.has(snapshot.id) ? snapshot.id : null,
          caseSnapshot: snapshot, caseRevision: revision, title: snapshot.title, externalKey: snapshot.key,
          iterationIndex: iteration.index,
          iterationValuesJson: Object.keys(iteration.values).length ? JSON.stringify(iteration.values) : null,
        }).returning({ id: runResults.id });
        if (iteration.steps.length) {
          await tx.insert(runStepResults).values(iteration.steps.map((step) => ({ ...step, resultId: result.id })));
        }
      }
    }
    created.push(run);
  }
  return created;
}
