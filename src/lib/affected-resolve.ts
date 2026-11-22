import {
  getCommitBySha,
  findPullRequestsByNumber,
  parseChangedPaths,
} from "@/lib/git-sync";

export type AffectedPathsInput = {
  paths?: string[];
  commitSha?: string;
  pr?: number;
  repositoryId?: string;
};

export type ResolvedAffectedPaths =
  | {
      ok: true;
      paths: string[];
      pathsSource: "paths" | "commit" | "pr";
      repositoryId?: string;
      headSha?: string | null;
      pullRequestId?: string;
    }
  | { ok: false; status: number; error: string };

export async function resolveAffectedPaths(
  workspaceId: string,
  input: AffectedPathsInput,
): Promise<ResolvedAffectedPaths> {
  const explicit = (input.paths ?? []).map((p) => p.trim()).filter(Boolean);
  if (explicit.length > 0) {
    return { ok: true, paths: [...new Set(explicit)], pathsSource: "paths" };
  }

  if (input.commitSha?.trim()) {
    const row = await getCommitBySha(workspaceId, input.commitSha, input.repositoryId);
    if (!row) {
      return { ok: false, status: 404, error: "Commit not found" };
    }
    const paths = parseChangedPaths(row.changedPathsJson);
    if (paths.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "No changed paths stored for this commit",
      };
    }
    return { ok: true, paths, pathsSource: "commit", repositoryId: row.repositoryId, headSha: row.sha };
  }

  if (input.pr != null && Number.isInteger(input.pr) && input.pr >= 1) {
    const matches = await findPullRequestsByNumber(workspaceId, input.pr, input.repositoryId);
    if (matches.length > 1) {
      return { ok: false, status: 409, error: "Multiple repositories have this pull request number. Provide repositoryId" };
    }
    const [row] = matches;
    if (!row) {
      return { ok: false, status: 404, error: "Pull request not found" };
    }
    const paths = parseChangedPaths(row.changedPathsJson);
    if (paths.length === 0) {
      return {
        ok: false,
        status: 400,
        error: "No changed paths stored for this pull request",
      };
    }
    return {
      ok: true, paths, pathsSource: "pr", repositoryId: row.repositoryId,
      headSha: row.headSha, pullRequestId: row.id,
    };
  }

  return {
    ok: false,
    status: 400,
    error: "Provide paths, commitSha, or pr",
  };
}
