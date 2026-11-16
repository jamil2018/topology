import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { matchesShareGeneration, type ReportSharePayload } from "./share-token";

export async function getReportShareGeneration(workspaceId: string, targetId: string) {
  const run = await db.query.runs.findFirst({
    where: and(eq(runs.workspaceId, workspaceId), eq(runs.id, targetId)),
    columns: { shareGeneration: true },
  });
  return run?.shareGeneration;
}

export async function isReportShareActive(payload: ReportSharePayload) {
  const generation = await getReportShareGeneration(payload.workspaceId, payload.targetId);
  return generation !== undefined && matchesShareGeneration(payload, generation);
}
