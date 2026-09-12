import { NextResponse } from "next/server";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { cases, runResults, runs } from "@/db/schema";
import { listRuns } from "@/lib/queries";

const createRunSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional().default(""),
  environment: z.string().optional().default("local"),
  caseIds: z.array(z.string().uuid()).optional().default([]),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const data = await listRuns();
  return NextResponse.json({ runs: data });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = createRunSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let caseIds = parsed.data.caseIds;
  if (caseIds.length === 0) {
    const ready = await db
      .select({ id: cases.id })
      .from(cases)
      .where(eq(cases.status, "ready"));
    caseIds = ready.map((c) => c.id);
  } else {
    const found = await db
      .select({ id: cases.id })
      .from(cases)
      .where(inArray(cases.id, caseIds));
    if (found.length !== caseIds.length) {
      return NextResponse.json(
        { error: "One or more case ids are invalid" },
        { status: 400 },
      );
    }
  }

  const [run] = await db
    .insert(runs)
    .values({
      name: parsed.data.name,
      description: parsed.data.description,
      environment: parsed.data.environment,
      createdById: session.user.id,
      status: "planned",
    })
    .returning();

  if (caseIds.length > 0) {
    await db.insert(runResults).values(
      caseIds.map((caseId) => ({
        runId: run.id,
        caseId,
        status: "untested" as const,
      })),
    );
  }

  return NextResponse.json({ run }, { status: 201 });
}
