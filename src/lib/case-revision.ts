import { createHash } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { cases, type RunnerCaseRevision } from "@/db/schema";
import { buildCaseVersionSnapshot, executableStepsForCase } from "@/lib/tcm/case-tcm";

export async function readCaseRevision(
  workspaceId: string,
  caseId: string,
  executor: Pick<typeof db, "query"> = db,
) {
  const [definition, steps] = await Promise.all([
    buildCaseVersionSnapshot(workspaceId, caseId, executor),
    executableStepsForCase({ workspaceId, caseId }, executor),
  ]);
  if (!definition) return null;
  // Shared steps can change independently of a case row.
  const snapshot = JSON.stringify({ definition, steps }, (_, value: unknown) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
      : value,
  );
  return { definition, revision: createHash("sha256").update(snapshot).digest("hex") };
}

export async function currentCaseRevisions(
  workspaceId: string,
  ids: string[],
  executor: Pick<typeof db, "query"> = db,
): Promise<RunnerCaseRevision[]> {
  if (!ids.length) return [];
  const rows = await executor.query.cases.findMany({ where: and(
    eq(cases.workspaceId, workspaceId), eq(cases.status, "ready"), inArray(cases.id, ids),
  ) });
  const revisions = await Promise.all(rows.map(async ({ id, key, intentId }) => {
    const snapshot = await readCaseRevision(workspaceId, id, executor);
    if (!snapshot || snapshot.definition.status !== "ready") return null;
    return { id, key, intentId, revision: snapshot.revision };
  }));
  return revisions.filter((revision) => revision !== null).sort((a, b) => a.id.localeCompare(b.id));
}
