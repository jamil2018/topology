import { NextResponse } from "next/server";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { pullRequests, repositories } from "@/db/schema";
import { ensurePullRequest, ensureRepository } from "@/lib/git-sync";
import { requireProjectAccess } from "@/lib/project";

const createSchema = z.object({
  number: z.number().int().min(1),
  title: z.string().min(1).max(500).optional(),
  base: z.string().min(1).max(200).optional(),
  head: z.string().min(1).max(200).optional(),
  status: z.enum(["open", "closed", "merged", "draft"]).optional(),
  repositoryId: z.string().uuid().optional(),
  remoteUrl: z.string().min(1).max(2048).optional(),
});

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "automation.view",
  });
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }
  const workspaceId = access.ctx.project.id;

  const { searchParams } = new URL(request.url);
  const repositoryId = searchParams.get("repositoryId");
  const numberParam = searchParams.get("number");

  const repos = await db.query.repositories.findMany({
    where: eq(repositories.workspaceId, workspaceId),
  });
  const repoIds = repos.map((r) => r.id);
  if (repoIds.length === 0) {
    return NextResponse.json({ pullRequests: [] });
  }

  if (repositoryId && !repoIds.includes(repositoryId)) {
    return NextResponse.json({ error: "Repository not found" }, { status: 404 });
  }

  const scopedRepoIds = repositoryId ? [repositoryId] : repoIds;

  let rows = await db.query.pullRequests.findMany({
    where: inArray(pullRequests.repositoryId, scopedRepoIds),
    orderBy: [desc(pullRequests.updatedAt), asc(pullRequests.number)],
    with: { repository: true },
  });

  if (numberParam) {
    const n = Number(numberParam);
    if (!Number.isInteger(n)) {
      return NextResponse.json({ error: "Invalid number" }, { status: 400 });
    }
    rows = rows.filter((r) => r.number === n);
  }

  return NextResponse.json({
    pullRequests: rows.map((r) => ({
      id: r.id,
      repositoryId: r.repositoryId,
      number: r.number,
      title: r.title,
      base: r.base,
      head: r.head,
      status: r.status,
      remoteUrl: r.repository?.remoteUrl ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const access = await requireProjectAccess(session.user.id, {
    request,
    action: "automation.manage",
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

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  let repositoryId = parsed.data.repositoryId;
  if (repositoryId) {
    const repo = await db.query.repositories.findFirst({
      where: and(
        eq(repositories.id, repositoryId),
        eq(repositories.workspaceId, workspaceId),
      ),
    });
    if (!repo) {
      return NextResponse.json({ error: "Repository not found" }, { status: 404 });
    }
  } else if (parsed.data.remoteUrl) {
    const repo = await ensureRepository(workspaceId, {
      remoteUrl: parsed.data.remoteUrl,
    });
    repositoryId = repo.id;
  } else {
    const repo = await db.query.repositories.findFirst({
      where: eq(repositories.workspaceId, workspaceId),
    });
    if (!repo) {
      return NextResponse.json(
        { error: "No repository connected; provide repositoryId or remoteUrl" },
        { status: 400 },
      );
    }
    repositoryId = repo.id;
  }

  try {
    const pullRequest = await ensurePullRequest(repositoryId, {
      number: parsed.data.number,
      title: parsed.data.title,
      base: parsed.data.base,
      head: parsed.data.head,
      status: parsed.data.status,
    });
    return NextResponse.json({ pullRequest }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not create pull request",
      },
      { status: 400 },
    );
  }
}
