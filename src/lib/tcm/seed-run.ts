import { db } from "@/db";
import { runResults, runStepResults } from "@/db/schema";
import {
  executableStepsForCase,
  loadCaseIterations,
} from "@/lib/tcm/case-tcm";

export async function seedManualRunResults(input: {
  workspaceId: string;
  runId: string;
  caseIds: readonly string[];
}, executor: Pick<typeof db, "insert" | "query"> = db) {
  for (const caseId of input.caseIds) {
    const iterations = await loadCaseIterations(caseId, executor);
    for (const iteration of iterations) {
      const [result] = await executor
        .insert(runResults)
        .values({
          runId: input.runId,
          caseId,
          status: "untested",
          iterationIndex: iteration.index,
          iterationValuesJson:
            Object.keys(iteration.values).length > 0
              ? JSON.stringify(iteration.values)
              : null,
        })
        .returning();
      const steps = await executableStepsForCase({
        workspaceId: input.workspaceId,
        caseId,
        values: iteration.values,
      }, executor);
      if (steps.length === 0) continue;
      await executor.insert(runStepResults).values(
        steps.map((step) => ({
          resultId: result.id,
          position: step.position,
          caseStepId: step.id,
          sharedStepId: step.sharedStepId,
          action: step.action,
          expected: step.expected,
          data: step.data,
          status: "untested" as const,
        })),
      );
    }
  }
}
