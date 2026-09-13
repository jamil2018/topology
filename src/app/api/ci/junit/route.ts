import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { summarizeResults } from "@topology/domain";
import { authenticateCiRequest } from "@/lib/ci-auth";
import {
  openTriageForFailures,
  upsertRunResultsFromNormalized,
} from "@/lib/ci-ingest";
import { db } from "@/db";
import { runs } from "@/db/schema";

const resultSchema = z.object({
  externalKey: z.string().min(1),
  classname: z.string().optional().default(""),
  name: z.string().optional().default(""),
  status: z.enum(["passed", "failed", "skipped", "blocked", "untested"]),
  notes: z.string().optional().default(""),
  durationMs: z.number().optional().default(0),
});

const bodySchema = z.object({
  runId: z.string().uuid().optional(),
  name: z.string().min(1).max(200).optional(),
  source: z.string().optional().default("cli"),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  results: z.array(resultSchema).min(1),
});

export async function POST(request: Request) {
  const authResult = await authenticateCiRequest(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  const json = await request.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let runId = parsed.data.runId;
  let run;

  if (runId) {
    run = await db.query.runs.findFirst({
      where: and(
        eq(runs.id, runId),
        eq(runs.workspaceId, authResult.workspaceId),
      ),
    });
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }
  } else {
    const [created] = await db
      .insert(runs)
      .values({
        workspaceId: authResult.workspaceId,
        name:
          parsed.data.name ??
          `JUnit submit ${new Date().toISOString()}`,
        kind: "automation",
        source: parsed.data.source,
        branch: parsed.data.branch,
        commitSha: parsed.data.commitSha,
        status: "in_progress",
        environment: "ci",
        startedAt: new Date(),
        createdById: authResult.userId,
        shardTotal: 1,
        shardsReceived: 1,
      })
      .returning();
    run = created;
    runId = created.id;
  }

  await upsertRunResultsFromNormalized(
    runId!,
    parsed.data.results,
    authResult.userId,
    authResult.workspaceId,
  );

  await db
    .update(runs)
    .set({
      status: "completed",
      completedAt: new Date(),
      updatedAt: new Date(),
      shardsReceived: 1,
    })
    .where(eq(runs.id, runId!));

  await openTriageForFailures(runId!);

  const { buildRunCompletedPayload, dispatchWebhook } = await import(
    "@/lib/webhooks"
  );
  const data = await buildRunCompletedPayload(runId!);
  if (data) {
    void dispatchWebhook("run.completed", data, authResult.workspaceId);
  }

  return NextResponse.json({
    run: { id: runId, name: run.name },
    summary: summarizeResults(parsed.data.results),
  });
}
