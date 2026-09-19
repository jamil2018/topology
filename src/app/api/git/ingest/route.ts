import { NextResponse } from "next/server";
import { z } from "zod";
import { authenticateCiRequest } from "@/lib/ci-auth";
import {
  ensureCommit,
  ensurePullRequest,
  ensureRepository,
  type PullRequestStatus,
} from "@/lib/git-sync";

const bodySchema = z
  .object({
    remoteUrl: z.string().min(1).max(2048),
    provider: z.enum(["github", "gitlab", "other"]).optional(),
    defaultBranch: z.string().min(1).max(200).optional(),
    commit: z
      .object({
        sha: z.string().min(1),
        message: z.string().optional(),
        committedAt: z.string().optional(),
        paths: z.array(z.string()).optional(),
      })
      .optional(),
    pullRequest: z
      .object({
        number: z.number().int().positive(),
        title: z.string().optional(),
        base: z.string().optional(),
        head: z.string().optional(),
        status: z.enum(["open", "closed", "merged", "draft"]).optional(),
        paths: z.array(z.string()).optional(),
      })
      .optional(),
  })
  .refine((data) => data.commit != null || data.pullRequest != null, {
    message: "commit or pullRequest is required",
  });

export async function POST(request: Request) {
  const ci = await authenticateCiRequest(request);
  if (!ci.ok) {
    return NextResponse.json({ error: ci.error }, { status: ci.status });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const repo = await ensureRepository(ci.workspaceId, {
    remoteUrl: parsed.data.remoteUrl,
    provider: parsed.data.provider,
    defaultBranch: parsed.data.defaultBranch,
  });

  let commitId: string | null = null;
  let pullRequestId: string | null = null;

  if (parsed.data.commit) {
    const c = parsed.data.commit;
    const row = await ensureCommit(repo.id, {
      sha: c.sha,
      message: c.message,
      committedAt: c.committedAt,
      changedPaths: c.paths,
    });
    commitId = row.id;
  }

  if (parsed.data.pullRequest) {
    const pr = parsed.data.pullRequest;
    const row = await ensurePullRequest(repo.id, {
      number: pr.number,
      title: pr.title,
      base: pr.base,
      head: pr.head,
      status: (pr.status ?? "open") as PullRequestStatus,
      changedPaths: pr.paths,
    });
    pullRequestId = row.id;
  }

  return NextResponse.json({
    ok: true,
    repositoryId: repo.id,
    commitId,
    pullRequestId,
  });
}
