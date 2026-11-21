import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { clusterTriageBySignature } from "@topology/domain";
import { auth } from "@/auth";
import { db } from "@/db";
import { triageItems } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import { getTriageQueue } from "@/lib/queries";
import { emitLive } from "@/lib/live";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, { request });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const queue = await getTriageQueue(access.ctx.project.id);
  const clusters = clusterTriageBySignature(queue);
  return NextResponse.json({ queue, clusters });
}

const TRIAGE_RESOLUTIONS = [
  "linked_issue",
  "duplicate",
  "wont_fix",
  "retest_scheduled",
] as const;

const patchSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["open", "snoozed", "resolved"]),
    resolution: z.enum(TRIAGE_RESOLUTIONS).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.status === "resolved" && !value.resolution) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "resolution is required when resolving",
        path: ["resolution"],
      });
    }
  });

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "triage.manage",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const patchValues: {
    status: typeof parsed.data.status;
    updatedAt: Date;
    resolution?: string | null;
  } = {
    status: parsed.data.status,
    updatedAt: new Date(),
  };
  if (parsed.data.status === "resolved") {
    patchValues.resolution = parsed.data.resolution ?? null;
  } else if (parsed.data.status === "open") {
    patchValues.resolution = null;
  }

  const [updated] = await db
    .update(triageItems)
    .set(patchValues)
    .where(
      and(
        eq(triageItems.id, parsed.data.id),
        eq(triageItems.workspaceId, workspaceId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  emitLive({
    workspaceId,
    topic: "triage",
    entityId: updated.id,
    status: updated.status,
  });

  return NextResponse.json({ item: updated });
}
