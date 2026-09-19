import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { testImplementations, testIntents } from "@/db/schema";
import { requireProjectAccess } from "@/lib/project";
import {
  LinkImplementationError,
  linkImplementationToIntent,
} from "@/lib/quality-graph";

const linkSchema = z
  .object({
    implementationId: z.string().uuid().optional(),
    /** Resolve implementation via workspace-scoped external key when id omitted. */
    externalKey: z.string().min(1).optional(),
    intentId: z.string().uuid().optional(),
    /** Resolve target intent by key when id omitted. */
    intentKey: z.string().min(1).optional(),
  })
  .refine((b) => Boolean(b.implementationId || b.externalKey), {
    message: "implementationId or externalKey is required",
  })
  .refine((b) => Boolean(b.intentId || b.intentKey), {
    message: "intentId or intentKey is required",
  });

/**
 * Link an AUTO / automation implementation onto an existing intent
 * (Phase 2 merge for 1:1 backfill duplicates).
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "intents.edit",
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

  const parsed = linkSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let implementationId = parsed.data.implementationId;
  if (!implementationId && parsed.data.externalKey) {
    const impl = await db.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.workspaceId, workspaceId),
        eq(testImplementations.externalKey, parsed.data.externalKey),
      ),
    });
    if (!impl) {
      return NextResponse.json(
        { error: "Implementation not found" },
        { status: 404 },
      );
    }
    implementationId = impl.id;
  }

  let intentId = parsed.data.intentId;
  if (!intentId && parsed.data.intentKey) {
    const intent = await db.query.testIntents.findFirst({
      where: and(
        eq(testIntents.workspaceId, workspaceId),
        eq(testIntents.key, parsed.data.intentKey),
      ),
    });
    if (!intent) {
      return NextResponse.json({ error: "Intent not found" }, { status: 404 });
    }
    intentId = intent.id;
  }

  if (!implementationId || !intentId) {
    return NextResponse.json({ error: "Invalid link request" }, { status: 400 });
  }

  try {
    const linked = await linkImplementationToIntent(
      workspaceId,
      implementationId,
      intentId,
    );
    return NextResponse.json({ ok: true, ...linked });
  } catch (err) {
    if (err instanceof LinkImplementationError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}
