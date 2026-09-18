import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authenticateCiRequest } from "@/lib/ci-auth";
import { ciFailureResponse, submitRunShard } from "@/lib/ci-ingest";
import { db } from "@/db";
import { runs } from "@/db/schema";
import {
  immutableMessageFor,
  isRunFrozen,
  runImmutableResponse,
} from "@/lib/run-immutability-http";

const durationMs = z
  .number()
  .int()
  .min(-2_147_483_648)
  .max(2_147_483_647)
  .optional()
  .default(0);

const bodySchema = z.object({
  shardIndex: z.number().int().min(1).max(256),
  results: z
    .array(
      z.object({
        externalKey: z.string().min(1),
        classname: z.string().optional().default(""),
        name: z.string().optional().default(""),
        status: z.enum(["passed", "failed", "skipped", "blocked", "untested"]),
        notes: z.string().optional().default(""),
        durationMs,
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
  if (!z.string().uuid().safeParse(id).success) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const run = await db.query.runs.findFirst({
    where: and(eq(runs.id, id), eq(runs.workspaceId, authResult.workspaceId)),
  });
  if (!run) {
    return NextResponse.json({ error: "Run not found" }, { status: 404 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (isRunFrozen(run.status)) {
    return runImmutableResponse(immutableMessageFor(run.status));
  }
  if (parsed.data.shardIndex > run.shardTotal) {
    return NextResponse.json(
      { error: "shardIndex must be between 1 and shardTotal" },
      { status: 400 },
    );
  }

  try {
    const ingested = await submitRunShard({
      runId: id,
      workspaceId: authResult.workspaceId,
      userId: authResult.userId,
      shardIndex: parsed.data.shardIndex,
      results: parsed.data.results,
    });

    return NextResponse.json({
      run: ingested.run,
      shard: {
        index: parsed.data.shardIndex,
        received: ingested.received,
        total: ingested.run.shardTotal,
      },
      summary: ingested.summary,
    });
  } catch (err) {
    const failure = ciFailureResponse(err);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
