import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCoverageSnapshotAccess } from "@/lib/coverage-snapshot-auth";
import {
  captureCoverageSnapshot,
  listSnapshots,
  serializeSnapshot,
} from "@/lib/coverage-snapshots";
import { syncIntentStaleWebhooks } from "@/lib/intent-freshness-webhooks";

const createSchema = z.object({
  label: z.string().max(200).nullable().optional(),
  source: z.enum(["nightly", "release", "manual"]).optional(),
  releaseId: z.string().uuid().nullable().optional(),
});

export async function GET(request: Request) {
  const authz = await authorizeCoverageSnapshotAccess(request);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const rows = await listSnapshots(authz.workspaceId);
  return NextResponse.json({
    snapshots: rows.map(serializeSnapshot),
  });
}

export async function POST(request: Request) {
  const authz = await authorizeCoverageSnapshotAccess(request);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  let body: unknown = {};
  const raw = await request.text();
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const snapshot = await captureCoverageSnapshot(authz.workspaceId, {
    label: parsed.data.label,
    source: parsed.data.source,
    releaseId: parsed.data.releaseId,
  });

  void syncIntentStaleWebhooks(authz.workspaceId).catch(() => {});

  return NextResponse.json({ snapshot }, { status: 201 });
}
