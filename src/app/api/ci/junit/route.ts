import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateCiRequest } from "@/lib/ci-auth";
import {
  ciFailureResponse,
  openTriageForFailures,
  submitJunitResults,
} from "@/lib/ci-ingest";

const durationMs = z
  .number()
  .int()
  .min(-2_147_483_648)
  .max(2_147_483_647)
  .optional()
  .default(0);

const resultSchema = z.object({
  externalKey: z.string().min(1),
  classname: z.string().optional().default(""),
  name: z.string().optional().default(""),
  status: z.enum(["passed", "failed", "skipped", "blocked", "untested"]),
  notes: z.string().optional().default(""),
  durationMs,
  errorMessage: z.string().optional(),
  stack: z.string().optional(),
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

  try {
    const ingested = await submitJunitResults({
      workspaceId: authResult.workspaceId,
      userId: authResult.userId,
      runId: parsed.data.runId,
      name:
        parsed.data.name ?? `JUnit submit ${new Date().toISOString()}`,
      source: parsed.data.source,
      branch: parsed.data.branch,
      commitSha: parsed.data.commitSha,
      results: parsed.data.results,
    });

    try {
      await openTriageForFailures(ingested.runId);
    } catch {
      // The run is already committed. Do not surface a later triage error as SQL.
    }

    const { buildRunCompletedPayload, dispatchWebhook } = await import(
      "@/lib/webhooks"
    );
    const data = await buildRunCompletedPayload(ingested.runId);
    if (data) {
      void dispatchWebhook(
        "run.completed",
        data,
        authResult.workspaceId,
      ).catch(() => {});
    }

    return NextResponse.json({
      run: { id: ingested.runId, name: ingested.runName },
      summary: ingested.summary,
    });
  } catch (err) {
    const failure = ciFailureResponse(err);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
