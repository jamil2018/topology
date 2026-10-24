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
}) {
  for (const caseId of input.caseIds) {
    const iterations = await loadCaseIterations(caseId);
    for (const iteration of iterations) {
      const [result] = await db
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
      });
      if (steps.length === 0) continue;
      await db.insert(runStepResults).values(
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
