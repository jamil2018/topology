import { NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { authenticateCiRequest } from "@/lib/ci-auth";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { auth } from "@/auth";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  source: z.string().optional().default("cli"),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  shardTotal: z.number().int().min(1).max(256).optional().default(1),
  environment: z.string().optional().default("ci"),
});

export async function GET(request: Request) {
  const session = await auth();
  const ci = session?.user ? null : await authenticateCiRequest(request);
  if (!session?.user && (!ci || !ci.ok)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const data = await db.query.runs.findMany({
    where: eq(runs.kind, "automation"),
    orderBy: [desc(runs.updatedAt)],
  });

  return NextResponse.json({ runs: data });
}

export async function POST(request: Request) {
  const authResult = await authenticateCiRequest(request);
  if (!authResult.ok) {
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status },
    );
  }

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const [run] = await db
    .insert(runs)
    .values({
      name: parsed.data.name,
      kind: "automation",
      source: parsed.data.source,
      branch: parsed.data.branch,
      commitSha: parsed.data.commitSha,
      environment: parsed.data.environment,
      status: "in_progress",
      startedAt: new Date(),
      shardTotal: parsed.data.shardTotal,
      shardsReceived: 0,
      createdById: authResult.userId,
      externalId: `thread-${Date.now()}`,
    })
    .returning();

  return NextResponse.json({ run }, { status: 201 });
}
