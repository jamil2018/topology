import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeCoverageSnapshotAccess } from "@/lib/coverage-snapshot-auth";
import {
  compareSnapshots,
  getSnapshot,
  serializeSnapshot,
} from "@/lib/coverage-snapshots";

export async function GET(request: Request) {
  const authz = await authorizeCoverageSnapshotAccess(request);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }

  const { searchParams } = new URL(request.url);
  const beforeId = searchParams.get("before")?.trim() ?? "";
  const afterId = searchParams.get("after")?.trim() ?? "";

  if (
    !z.string().uuid().safeParse(beforeId).success ||
    !z.string().uuid().safeParse(afterId).success
  ) {
    return NextResponse.json(
      { error: "before and after must be snapshot UUIDs" },
      { status: 400 },
    );
  }

  const [before, after] = await Promise.all([
    getSnapshot(authz.workspaceId, beforeId),
    getSnapshot(authz.workspaceId, afterId),
  ]);

  if (!before || !after) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const deltas = compareSnapshots(before, after);
  if (!deltas) {
    return NextResponse.json(
      { error: "Could not parse snapshot dimensions" },
      { status: 500 },
    );
  }

  return NextResponse.json({
    before: serializeSnapshot(before),
    after: serializeSnapshot(after),
    deltas,
  });
}
