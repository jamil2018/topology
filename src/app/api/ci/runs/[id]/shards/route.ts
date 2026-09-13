import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { mergeShardResults, summarizeResults } from "@topology/domain";
import { authenticateCiRequest } from "@/lib/ci-auth";
import {
  loadShardResults,
  storeShardPayload,
  upsertRunResultsFromNormalized,
} from "@/lib/ci-ingest";
import { db } from "@/db";
import { runs } from "@/db/schema";
import {
  isRunFrozen,
  runImmutableResponse,
} from "@/lib/run-immutability";

const bodySchema = z.object({
  shardIndex: z.number().int().min(1),
  results: z
    .array(
      z.object({
        externalKey: z.string().min(1),
        classname: z.string().optional().default(""),
        name: z.string().optional().default(""),
        status: z.enum(["passed", "failed", "skipped", "blocked", "untested"]),
        notes: z.string().optional().default(""),
        durationMs: z.number().optional().default(0),
      }),
    )
    .min(1),
});

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
  const run = await db.query.runs.findFirst({
    where: and(eq(runs.id, id), eq(runs.workspaceId, authResult.workspaceId)),
  });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }
  if (isRunFrozen(run.status)) {
    return runImmutableResponse();
  }

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  await storeShardPayload(id, parsed.data.shardIndex, parsed.data.results);

  const shards = await loadShardResults(id);
  const merged = mergeShardResults(shards);

  await upsertRunResultsFromNormalized(
    id,
    merged,
    authResult.userId,
    authResult.workspaceId,
  );

  const [updated] = await db
    .update(runs)
    .set({
      shardsReceived: shards.length,
      status: "in_progress",
      updatedAt: new Date(),
    })
    .where(eq(runs.id, id))
    .returning();

  return NextResponse.json({
    run: updated,
    shard: {
      index: parsed.data.shardIndex,
      received: shards.length,
      total: run.shardTotal,
    },
    summary: summarizeResults(merged),
  });
}
