import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  commits,
  pullRequests,
  repositories,
  type Commit,
  type PullRequest,
  type Repository,
} from "@/db/schema";

export type RepositoryProvider = "github" | "gitlab" | "other";
export type PullRequestStatus = "open" | "closed" | "merged" | "draft";

/** Subset of db/tx used by git upsert helpers. */
export type GitSyncDb = {
  query: {
    repositories: {
      findFirst: typeof db.query.repositories.findFirst;
    };
    commits: {
      findFirst: typeof db.query.commits.findFirst;
    };
    pullRequests: {
      findFirst: typeof db.query.pullRequests.findFirst;
    };
  };
  insert: typeof db.insert;
  update: typeof db.update;
};

function normalizeRemoteUrl(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

/**
 * Find or create a repository row for the workspace.
 * Matching is by (workspaceId, remoteUrl).
 */
export async function ensureRepository(
  workspaceId: string,
  input: {
    remoteUrl: string;
    provider?: RepositoryProvider;
    defaultBranch?: string;
  },
  executor: GitSyncDb = db,
): Promise<Repository> {
  const remoteUrl = normalizeRemoteUrl(input.remoteUrl);
  const existing = await executor.query.repositories.findFirst({
    where: and(
      eq(repositories.workspaceId, workspaceId),
      eq(repositories.remoteUrl, remoteUrl),
    ),
  });
  if (existing) return existing;

  const [created] = await executor
    .insert(repositories)
    .values({
      workspaceId,
      remoteUrl,
      provider: input.provider ?? "github",
      defaultBranch: input.defaultBranch ?? "main",
    })
    .returning();
  if (!created) {
    throw new Error("Failed to create repository");
  }
  return created;
}

/**
 * Upsert a commit by (repositoryId, sha). Empty message is allowed.
 */
export async function ensureCommit(
  repositoryId: string,
  input: {
    sha: string;
    message?: string;
    committedAt?: Date | string;
  },
  executor: GitSyncDb = db,
): Promise<Commit> {
  const sha = input.sha.trim();
  if (!sha) {
    throw new Error("commit sha is required");
  }

  const existing = await executor.query.commits.findFirst({
    where: and(eq(commits.repositoryId, repositoryId), eq(commits.sha, sha)),
  });
  if (existing) {
    if (input.message != null && input.message !== existing.message) {
      const [updated] = await executor
        .update(commits)
        .set({ message: input.message })
        .where(eq(commits.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  const committedAt =
    input.committedAt instanceof Date
      ? input.committedAt
      : input.committedAt
        ? new Date(input.committedAt)
        : new Date();

  const [created] = await executor
    .insert(commits)
    .values({
      repositoryId,
      sha,
      message: input.message ?? "",
      committedAt: Number.isFinite(committedAt.getTime())
        ? committedAt
        : new Date(),
    })
    .returning();
  if (!created) {
    throw new Error("Failed to create commit");
  }
  return created;
}

/**
 * Upsert a pull request by (repositoryId, number).
 */
export async function ensurePullRequest(
  repositoryId: string,
  input: {
    number: number;
    title?: string;
    base?: string;
    head?: string;
    status?: PullRequestStatus;
  },
  executor: GitSyncDb = db,
): Promise<PullRequest> {
  if (!Number.isInteger(input.number) || input.number < 1) {
    throw new Error("pull request number must be a positive integer");
  }

  const existing = await executor.query.pullRequests.findFirst({
    where: and(
      eq(pullRequests.repositoryId, repositoryId),
      eq(pullRequests.number, input.number),
    ),
  });
  if (existing) {
    const patch: {
      title?: string;
      base?: string;
      head?: string;
      status?: PullRequestStatus;
      updatedAt: Date;
    } = {
      updatedAt: new Date(),
    };
    if (input.title != null) patch.title = input.title;
    if (input.base != null) patch.base = input.base;
    if (input.head != null) patch.head = input.head;
    if (input.status != null) patch.status = input.status;

    const [updated] = await executor
      .update(pullRequests)
      .set(patch)
      .where(eq(pullRequests.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await executor
    .insert(pullRequests)
    .values({
      repositoryId,
      number: input.number,
      title: input.title ?? `PR #${input.number}`,
      base: input.base ?? "main",
      head: input.head ?? "",
      status: input.status ?? "open",
    })
    .returning();
  if (!created) {
    throw new Error("Failed to create pull request");
  }
  return created;
}

export type ResolveRunGitRefsInput = {
  workspaceId: string;
  /** Optional remote URL; when omitted, uses the workspace's first repository. */
  remoteUrl?: string;
  commitSha?: string;
  commitMessage?: string;
  /** PR number from CI (`--pr 843`). */
  pr?: number;
  prTitle?: string;
  branch?: string;
  baseBranch?: string;
};

export type ResolvedRunGitRefs = {
  repositoryId: string | null;
  commitId: string | null;
  pullRequestId: string | null;
};

/**
 * Resolve optional commitSha / PR number into FK ids for a CI run.
 * Creates missing commit/PR rows when a repository is available.
 * Returns null ids when there is nothing to link (non-breaking for junit).
 */
export async function resolveRunGitRefs(
  input: ResolveRunGitRefsInput,
  executor: GitSyncDb = db,
): Promise<ResolvedRunGitRefs> {
  const empty: ResolvedRunGitRefs = {
    repositoryId: null,
    commitId: null,
    pullRequestId: null,
  };

  const wantsCommit = Boolean(input.commitSha?.trim());
  const wantsPr =
    input.pr != null && Number.isInteger(input.pr) && input.pr >= 1;
  if (!wantsCommit && !wantsPr) return empty;

  let repo: Repository | null = null;
  if (input.remoteUrl?.trim()) {
    repo = await ensureRepository(
      input.workspaceId,
      { remoteUrl: input.remoteUrl },
      executor,
    );
  } else {
    repo =
      (await executor.query.repositories.findFirst({
        where: eq(repositories.workspaceId, input.workspaceId),
      })) ?? null;
  }

  if (!repo) return empty;

  let commitId: string | null = null;
  if (wantsCommit && input.commitSha) {
    const commit = await ensureCommit(
      repo.id,
      {
        sha: input.commitSha,
        message: input.commitMessage,
      },
      executor,
    );
    commitId = commit.id;
  }

  let pullRequestId: string | null = null;
  if (wantsPr && input.pr != null) {
    const pr = await ensurePullRequest(
      repo.id,
      {
        number: input.pr,
        title: input.prTitle,
        base: input.baseBranch ?? repo.defaultBranch,
        head: input.branch ?? input.commitSha ?? "",
        status: "open",
      },
      executor,
    );
    pullRequestId = pr.id;
  }

  return {
    repositoryId: repo.id,
    commitId,
    pullRequestId,
  };
}
