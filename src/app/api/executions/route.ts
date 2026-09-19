import { NextResponse } from "next/server";
import { parseExecutionReport } from "@topology/domain";
import { authenticateCiRequest } from "@/lib/ci-auth";
import {
  ciFailureResponse,
  extractTopologyRunId,
  submitExecutionReport,
} from "@/lib/execution-ingest";
import { openTriageForFailures } from "@/lib/ci-ingest";

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

  const { runId: topologyRunId, reportPayload } = extractTopologyRunId(json);
  const parsed = parseExecutionReport(reportPayload);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: "Invalid execution report", issues: parsed.errors },
      { status: 400 },
    );
  }

  try {
    const ingested = await submitExecutionReport({
      workspaceId: authResult.workspaceId,
      userId: authResult.userId,
      report: parsed.report,
      runId: topologyRunId,
    });

    try {
      await openTriageForFailures(ingested.runId);
    } catch {
      // Run already committed; triage is best-effort.
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

    const { syncIntentStaleWebhooks } = await import(
      "@/lib/intent-freshness-webhooks"
    );
    void syncIntentStaleWebhooks(authResult.workspaceId).catch(() => {});

    return NextResponse.json({
      ok: true,
      runId: ingested.runId,
      resultIds: ingested.resultIds,
    });
  } catch (err) {
    const failure = ciFailureResponse(err);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
