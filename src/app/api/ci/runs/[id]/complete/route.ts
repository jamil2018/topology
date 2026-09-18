import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { authenticateCiRequest } from "@/lib/ci-auth";
import {
  ciFailureResponse,
  completeCiRun,
  openTriageForFailures,
} from "@/lib/ci-ingest";
import { db } from "@/db";
import { runs } from "@/db/schema";
import {
  immutableMessageFor,
  isRunFrozen,
  runImmutableResponse,
} from "@/lib/run-immutability-http";

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

  const rawBody = await request.text();
  if (rawBody.trim()) {
    try {
      JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  if (isRunFrozen(run.status)) {
    return runImmutableResponse(immutableMessageFor(run.status));
  }

  try {
    const completed = await completeCiRun({
      runId: id,
      workspaceId: authResult.workspaceId,
      userId: authResult.userId,
    });

    try {
      await openTriageForFailures(id);
    } catch {
      // The run is already committed. Do not surface a later triage error as SQL.
    }

    const { buildRunCompletedPayload, dispatchWebhook } = await import(
      "@/lib/webhooks"
    );
    const data = await buildRunCompletedPayload(id);
    if (data) {
      void dispatchWebhook(
        "run.completed",
        data,
        authResult.workspaceId,
      ).catch(() => {});
    }

    return NextResponse.json({
      run: completed.run,
      summary: completed.summary,
    });
  } catch (err) {
    const failure = ciFailureResponse(err);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
