import { NextResponse } from "next/server";
import { z } from "zod";
import {
  ensureCommit,
  ensurePullRequest,
  ensureRepository,
  type PullRequestStatus,
} from "@/lib/git-sync";
import {
  collectGithubCommitPaths,
  githubPullRequestStatus,
  parseTopologyChangedFilesHeader,
  TOPOLOGY_CHANGED_FILES_HEADER,
  verifyGithubSignature,
} from "@/lib/github-webhook";
import { CI_PROJECT_HEADER } from "@/lib/ci-auth";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function resolveWebhookWorkspaceId(request: Request): string | null {
  const { searchParams } = new URL(request.url);
  const fromQuery = searchParams.get("workspaceId")?.trim();
  if (fromQuery && UUID_RE.test(fromQuery)) return fromQuery;
  const fromHeader = request.headers.get(CI_PROJECT_HEADER)?.trim();
  if (fromHeader && UUID_RE.test(fromHeader)) return fromHeader;
  return null;
}

const pushSchema = z.object({
  ref: z.string().optional(),
  repository: z.object({
    clone_url: z.string().optional(),
    html_url: z.string().optional(),
    default_branch: z.string().optional(),
  }),
  commits: z
    .array(
      z.object({
        id: z.string(),
        message: z.string().optional(),
        timestamp: z.string().optional(),
        added: z.array(z.string()).optional(),
        modified: z.array(z.string()).optional(),
        removed: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

const pullRequestSchema = z.object({
  action: z.string(),
  pull_request: z.object({
    number: z.number().int().positive(),
    title: z.string(),
    draft: z.boolean().optional(),
    merged: z.boolean().optional(),
    base: z.object({ ref: z.string() }),
    head: z.object({ ref: z.string(), sha: z.string().optional() }),
  }),
  repository: z.object({
    clone_url: z.string().optional(),
    html_url: z.string().optional(),
    default_branch: z.string().optional(),
  }),
});

export async function POST(request: Request) {
  const workspaceId = resolveWebhookWorkspaceId(request);
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
  const sig = verifyGithubSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
    process.env.TOPOLOGY_GITHUB_WEBHOOK_SECRET,
  );
  if (!sig.ok) {
    return NextResponse.json({ error: sig.error }, { status: sig.status });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody) as unknown;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const event = request.headers.get("x-github-event") ?? "";

  if (event === "push") {
    const parsed = pushSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const remoteUrl =
      parsed.data.repository.clone_url ??
      parsed.data.repository.html_url ??
      "";
    if (!remoteUrl) {
      return NextResponse.json(
        { error: "repository URL missing" },
        { status: 400 },
      );
    }

    const repo = await ensureRepository(workspaceId, {
      remoteUrl,
      provider: "github",
      defaultBranch: parsed.data.repository.default_branch ?? "main",
    });

    const commitsInPayload = parsed.data.commits ?? [];
    let upserted = 0;
    for (const c of commitsInPayload) {
      await ensureCommit(repo.id, {
        sha: c.id,
        message: c.message,
        committedAt: c.timestamp,
        changedPaths: collectGithubCommitPaths(c),
      });
      upserted += 1;
    }

    return NextResponse.json({ ok: true, event, commits: upserted });
  }

  if (event === "pull_request") {
    const parsed = pullRequestSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { action, pull_request: pr } = parsed.data;
    if (!["opened", "synchronize", "reopened", "closed"].includes(action)) {
      return NextResponse.json({ ok: true, event, action, skipped: true });
    }

    const remoteUrl =
      parsed.data.repository.clone_url ??
      parsed.data.repository.html_url ??
      "";
    if (!remoteUrl) {
      return NextResponse.json(
        { error: "repository URL missing" },
        { status: 400 },
      );
    }

    const repo = await ensureRepository(workspaceId, {
      remoteUrl,
      provider: "github",
      defaultBranch: parsed.data.repository.default_branch ?? "main",
    });

    const status: PullRequestStatus = githubPullRequestStatus(
      action,
      Boolean(pr.merged),
      Boolean(pr.draft),
    );

    const headerPaths = parseTopologyChangedFilesHeader(
      request.headers.get(TOPOLOGY_CHANGED_FILES_HEADER),
    );

    await ensurePullRequest(repo.id, {
      number: pr.number,
      title: pr.title,
      base: pr.base.ref,
      head: pr.head.sha ?? pr.head.ref,
      status,
      ...(headerPaths.length > 0 ? { changedPaths: headerPaths } : {}),
    });

    return NextResponse.json({ ok: true, event, action, number: pr.number });
  }

  return NextResponse.json({ ok: true, event, ignored: true });
}
