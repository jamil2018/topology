import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { mergeShardResults, summarizeResults } from "@topology/domain";
import { authenticateCiRequest } from "@/lib/ci-auth";
import {
  loadShardResults,
  openTriageForFailures,
  upsertRunResultsFromNormalized,
} from "@/lib/ci-ingest";
import { db } from "@/db";
import { runs } from "@/db/schema";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  const authResult = await authenticateCiRequest(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  const { id } = await params;
  const run = await db.query.runs.findFirst({ where: eq(runs.id, id) });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  const shards = await loadShardResults(id);
  if (shards.length > 0) {
    const merged = mergeShardResults(shards);
    await upsertRunResultsFromNormalized(id, merged, authResult.userId);
  }

  const [updated] = await db
    .update(runs)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(runs.id, id))
    .returning();

  await openTriageForFailures(id);

  const merged = shards.length > 0 ? mergeShardResults(shards) : [];

  const { buildRunCompletedPayload, dispatchWebhook } = await import(
    "@/lib/webhooks"
  );
  const data = await buildRunCompletedPayload(id);
  if (data) {
    void dispatchWebhook("run.completed", data);
  }

  return NextResponse.json({
    run: updated,
    summary: summarizeResults(merged),
  });
}
