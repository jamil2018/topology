import { NextResponse } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { authenticateCiRequest } from "@/lib/ci-auth";
import { ciFailureResponse } from "@/lib/ci-ingest";
import { resolveRunGitRefs } from "@/lib/git-sync";
import { db } from "@/db";
import { runs } from "@/db/schema";
import { auth } from "@/auth";
import { requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  source: z.string().optional().default("cli"),
  branch: z.string().optional(),
  commitSha: z.string().optional(),
  /** Pull request number (e.g. from `topology runs create --pr 843`). */
  pr: z.number().int().min(1).optional(),
  prTitle: z.string().max(500).optional(),
  remoteUrl: z.string().min(1).max(2048).optional(),
  shardTotal: z.number().int().min(1).max(256).optional().default(1),
  environment: z.string().optional().default("ci"),
});

export async function GET(request: Request) {
  const session = await auth();
  let workspaceId: string | null = null;

  if (session?.user?.id) {
    const access = await requireProjectAccess(session.user.id, { request });
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }
    workspaceId = access.ctx.project.id;
  } else {
    const ci = await authenticateCiRequest(request);
    if (!ci.ok) {
      return NextResponse.json({ error: ci.error }, { status: ci.status });
    }
    workspaceId = ci.workspaceId;
  }

  const data = await db.query.runs.findMany({
    where: and(eq(runs.kind, "automation"), eq(runs.workspaceId, workspaceId)),
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

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const gitRefs = await resolveRunGitRefs({
      workspaceId: authResult.workspaceId,
      remoteUrl: parsed.data.remoteUrl,
      commitSha: parsed.data.commitSha,
      pr: parsed.data.pr,
      prTitle: parsed.data.prTitle,
      branch: parsed.data.branch,
    });

    const [run] = await db
      .insert(runs)
      .values({
        workspaceId: authResult.workspaceId,
        name: parsed.data.name,
        kind: "automation",
        source: parsed.data.source,
        branch: parsed.data.branch,
        commitSha: parsed.data.commitSha,
        commitId: gitRefs.commitId,
        pullRequestId: gitRefs.pullRequestId,
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
  } catch (err) {
    const failure = ciFailureResponse(err);
    return NextResponse.json(failure.body, { status: failure.status });
  }
}
