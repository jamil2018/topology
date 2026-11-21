import { NextResponse } from "next/server";
import {
  applyInboundIssueSync,
  isInboundIssueProvider,
  parseInboundIssuePayload,
  resolveInboundWorkspaceId,
  verifyInboundIssueWebhook,
} from "@/lib/issue-inbound-webhooks";

type Params = { params: Promise<{ provider: string }> };

export async function POST(request: Request, { params }: Params) {
  const { provider: rawProvider } = await params;
  const provider = rawProvider.trim().toLowerCase();
  if (!isInboundIssueProvider(provider)) {
    return NextResponse.json(
      { error: `Unsupported issue provider "${rawProvider}"` },
      { status: 404 },
    );
  }

  const workspaceId = resolveInboundWorkspaceId(request);
  if (!workspaceId) {
    return NextResponse.json(
      {
        error:
          "workspaceId query param or x-topology-project-id header required",
      },
      { status: 400 },
    );
  }

  const rawBody = await request.text();
  const verified = verifyInboundIssueWebhook({
    provider,
    rawBody,
    headers: request.headers,
  });
  if (!verified.ok) {
    return NextResponse.json(
      { error: verified.error },
      { status: verified.status },
    );
  }

  let payload: unknown = null;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = parseInboundIssuePayload(provider, payload, request.headers);
  if (!event) {
    return NextResponse.json(
      { error: "Unrecognized issue webhook payload" },
      { status: 400 },
    );
  }
  if (event.skipped) {
    return NextResponse.json({
      ok: true,
      provider,
      skipped: true,
      reason: event.reason ?? "ignored_event",
    });
  }

  const result = await applyInboundIssueSync({
    workspaceId,
    provider,
    event,
  });

  return NextResponse.json({
    ok: true,
    provider,
    remoteId: event.remoteId,
    remoteStatus: event.remoteStatus,
    updated: result.updated,
    needsRetest: result.needsRetest,
  });
}
