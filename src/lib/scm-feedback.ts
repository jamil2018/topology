import { and, eq } from "drizzle-orm";
import {
  clusterFailuresBySignature,
  failureSignatureHash,
  type FailureSignatureCluster,
} from "@topology/domain";
import { db } from "@/db";
import {
  commits,
  pullRequests,
  repositories,
  runs,
  type Repository,
} from "@/db/schema";

/** Sticky marker so Topology can find and update its own PR/MR comment. */
export const SCM_FEEDBACK_MARKER = "<!-- topology-scm-feedback -->";
export const SCM_CHECK_NAME = "Topology";

export type ScmFeedbackSummary = {
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  untested: number;
  flake: number;
  total: number;
};

export type ScmFailureSignature = {
  hash: string;
  message: string;
  count: number;
};

export type ScmGapHint = {
  key: string;
  title: string;
  kind: string;
};

export type ScmReadinessSnippet = {
  milestoneName: string;
  status: string;
  badge: string;
} | null;

export type ScmFeedbackPayload = {
  runId: string;
  runName: string;
  commitSha: string | null;
  prNumber: number | null;
  summary: ScmFeedbackSummary;
  signatures: ScmFailureSignature[];
  gaps: ScmGapHint[];
  readiness: ScmReadinessSnippet;
  runUrl: string;
  reportUrl: string;
};

export type ScmCheckConclusion = "success" | "failure" | "neutral";

export type ScmCheckInput = {
  repoSlug: string;
  headSha: string;
  conclusion: ScmCheckConclusion;
  title: string;
  summaryMarkdown: string;
  detailsUrl: string;
  externalId: string;
};

export type ScmCommentInput = {
  repoSlug: string;
  prNumber: number;
  body: string;
};

export type ScmFeedbackClient = {
  upsertCheckRun: (input: ScmCheckInput) => Promise<{ id: string }>;
  upsertStickyComment: (input: ScmCommentInput) => Promise<{ id: string }>;
};

export type ScmFeedbackClientConfig = {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
};

export type ScmFeedbackPublishResult = {
  skipped: boolean;
  reason?: string;
  checkRunId?: string;
  commentId?: string;
};

export type RepositoryScmToggles = Pick<
  Repository,
  | "id"
  | "provider"
  | "remoteUrl"
  | "postPrStatusChecks"
  | "postPrSummaryComment"
>;

function appBaseUrl(): string {
  return (
    process.env.AUTH_URL ??
    process.env.TOPOLOGY_URL ??
    "http://127.0.0.1:4317"
  ).replace(/\/$/, "");
}

/**
 * Parse owner/repo (GitHub) or group/project (GitLab) from a remote URL.
 */
export function parseScmRepoSlug(remoteUrl: string): string | null {
  const raw = remoteUrl.trim().replace(/\/+$/, "");
  if (!raw) return null;

  let path = raw;
  const ssh = /^git@([^:]+):(.+)$/i.exec(raw);
  if (ssh) {
    path = ssh[2] ?? "";
  } else {
    try {
      const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
      path = u.pathname.replace(/^\//, "");
    } catch {
      return null;
    }
  }

  path = path.replace(/\.git$/i, "").replace(/\/+$/, "");
  if (!path.includes("/")) return null;
  return path;
}

export function summarizeRunResults(
  results: Array<{ status: string }>,
  flake = 0,
): ScmFeedbackSummary {
  const summary: ScmFeedbackSummary = {
    passed: 0,
    failed: 0,
    blocked: 0,
    skipped: 0,
    untested: 0,
    flake,
    total: results.length,
  };
  for (const row of results) {
    if (row.status === "passed") summary.passed += 1;
    else if (row.status === "failed") summary.failed += 1;
    else if (row.status === "blocked") summary.blocked += 1;
    else if (row.status === "skipped") summary.skipped += 1;
    else summary.untested += 1;
  }
  return summary;
}

export function scmCheckConclusion(
  summary: ScmFeedbackSummary,
  readiness: ScmReadinessSnippet,
): ScmCheckConclusion {
  if (summary.failed > 0 || summary.blocked > 0) return "failure";
  if (readiness?.status === "no_go") return "failure";
  if (readiness?.status === "at_risk") return "neutral";
  if (summary.total === 0) return "neutral";
  return "success";
}

export function signaturesFromResults(
  results: Array<{
    status: string;
    errorMessage?: string | null;
    stack?: string | null;
    notes?: string | null;
  }>,
  limit = 5,
): ScmFailureSignature[] {
  const failed = results.filter(
    (r) => r.status === "failed" || r.status === "blocked",
  );
  if (failed.length === 0) return [];

  const members = failed.map((r, i) => ({
    id: String(i),
    signatureHash: failureSignatureHash({
      errorMessage: r.errorMessage,
      stack: r.stack,
      notes: r.notes,
    }),
    errorMessage: r.errorMessage,
    stack: r.stack,
    notes: r.notes,
  }));

  const clusters: FailureSignatureCluster[] =
    clusterFailuresBySignature(members);
  return clusters.slice(0, limit).map((c) => ({
    hash: c.signatureHash.slice(0, 8),
    message: c.normalizedMessage || "(no message)",
    count: c.count,
  }));
}

export function formatScmCheckTitle(
  summary: ScmFeedbackSummary,
  readiness: ScmReadinessSnippet,
): string {
  const parts = [
    `${summary.passed} passed`,
    `${summary.failed} failed`,
  ];
  if (summary.flake > 0) parts.push(`${summary.flake} flake`);
  if (readiness) {
    parts.push(`milestone ${readiness.badge}`);
  }
  return parts.join(" · ");
}

export function formatScmCheckSummaryMarkdown(
  payload: ScmFeedbackPayload,
): string {
  const lines = [
    `**${payload.runName}**`,
    "",
    `| Result | Count |`,
    `| --- | ---: |`,
    `| Passed | ${payload.summary.passed} |`,
    `| Failed | ${payload.summary.failed} |`,
    `| Blocked | ${payload.summary.blocked} |`,
    `| Flake | ${payload.summary.flake} |`,
  ];
  if (payload.readiness) {
    lines.push(
      "",
      `Milestone **${payload.readiness.milestoneName}**: ${payload.readiness.badge} (\`${payload.readiness.status}\`)`,
    );
  }
  lines.push("", `[Open run](${payload.runUrl}) · [Report](${payload.reportUrl})`);
  return lines.join("\n");
}

export function formatScmPrCommentBody(payload: ScmFeedbackPayload): string {
  const verdict =
    payload.summary.failed > 0 || payload.summary.blocked > 0
      ? "❌ Fail"
      : payload.summary.total === 0
        ? "➖ Empty"
        : "✅ Pass";

  const lines = [
    SCM_FEEDBACK_MARKER,
    `### Topology — ${verdict}`,
    "",
    `**${payload.runName}**`,
    "",
    `- Passed: **${payload.summary.passed}**`,
    `- Failed: **${payload.summary.failed}**`,
    `- Flake: **${payload.summary.flake}**`,
  ];

  if (payload.readiness) {
    lines.push(
      `- Milestone readiness: **${payload.readiness.badge}** (${payload.readiness.milestoneName})`,
    );
  }

  if (payload.signatures.length > 0) {
    lines.push("", "**Failure signatures**");
    for (const sig of payload.signatures) {
      lines.push(
        `- \`${sig.hash}\` ×${sig.count} — ${sig.message.slice(0, 120)}`,
      );
    }
  }

  if (payload.gaps.length > 0) {
    lines.push("", "**Coverage gaps**");
    for (const gap of payload.gaps.slice(0, 5)) {
      lines.push(`- \`${gap.key}\` ${gap.title} _(${gap.kind})_`);
    }
  }

  lines.push(
    "",
    `[View run](${payload.runUrl}) · [View report](${payload.reportUrl})`,
  );
  return lines.join("\n");
}

export function resolveScmToken(
  provider: Repository["provider"],
): string | null {
  if (provider === "github") {
    return (
      process.env.GITHUB_TOKEN?.trim() ||
      process.env.TOPOLOGY_ISSUE_TOKEN?.trim() ||
      null
    );
  }
  if (provider === "gitlab") {
    return (
      process.env.GITLAB_TOKEN?.trim() ||
      process.env.TOPOLOGY_ISSUE_TOKEN?.trim() ||
      null
    );
  }
  return null;
}

export function createGithubScmFeedbackClient(
  config: ScmFeedbackClientConfig,
): ScmFeedbackClient {
  const apiBase = (config.baseUrl ?? "https://api.github.com").replace(
    /\/$/,
    "",
  );
  const fetchImpl = config.fetch ?? fetch;

  function headers(): HeadersInit {
    return {
      Authorization: `Bearer ${config.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  function parseOwnerRepo(slug: string): { owner: string; repo: string } {
    const [owner, repo, ...rest] = slug.split("/");
    if (!owner || !repo || rest.length > 0) {
      throw new Error(`GitHub repo slug must be owner/repo (got ${slug})`);
    }
    return { owner, repo };
  }

  async function readJson<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GitHub HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  return {
    async upsertCheckRun(input) {
      const { owner, repo } = parseOwnerRepo(input.repoSlug);
      const listUrl = `${apiBase}/repos/${owner}/${repo}/commits/${encodeURIComponent(input.headSha)}/check-runs?check_name=${encodeURIComponent(SCM_CHECK_NAME)}&filter=latest`;
      const listed = await fetchImpl(listUrl, { headers: headers() });
      const listData = await readJson<{
        check_runs?: Array<{ id: number; external_id?: string | null }>;
      }>(listed);
      const existing = (listData.check_runs ?? []).find(
        (c) => c.external_id === input.externalId,
      );

      const body = {
        name: SCM_CHECK_NAME,
        head_sha: input.headSha,
        status: "completed",
        conclusion: input.conclusion,
        external_id: input.externalId,
        details_url: input.detailsUrl,
        output: {
          title: input.title,
          summary: input.summaryMarkdown,
        },
      };

      if (existing) {
        const res = await fetchImpl(
          `${apiBase}/repos/${owner}/${repo}/check-runs/${existing.id}`,
          {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify(body),
          },
        );
        const data = await readJson<{ id: number }>(res);
        return { id: String(data.id) };
      }

      const res = await fetchImpl(
        `${apiBase}/repos/${owner}/${repo}/check-runs`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify(body),
        },
      );
      const data = await readJson<{ id: number }>(res);
      return { id: String(data.id) };
    },

    async upsertStickyComment(input) {
      const { owner, repo } = parseOwnerRepo(input.repoSlug);
      const listUrl = `${apiBase}/repos/${owner}/${repo}/issues/${input.prNumber}/comments?per_page=100`;
      const listed = await fetchImpl(listUrl, { headers: headers() });
      const comments = await readJson<
        Array<{ id: number; body?: string | null }>
      >(listed);
      const existing = comments.find((c) =>
        (c.body ?? "").includes(SCM_FEEDBACK_MARKER),
      );

      if (existing) {
        const res = await fetchImpl(
          `${apiBase}/repos/${owner}/${repo}/issues/comments/${existing.id}`,
          {
            method: "PATCH",
            headers: headers(),
            body: JSON.stringify({ body: input.body }),
          },
        );
        const data = await readJson<{ id: number }>(res);
        return { id: String(data.id) };
      }

      const res = await fetchImpl(
        `${apiBase}/repos/${owner}/${repo}/issues/${input.prNumber}/comments`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ body: input.body }),
        },
      );
      const data = await readJson<{ id: number }>(res);
      return { id: String(data.id) };
    },
  };
}

function gitlabApiBase(baseUrl?: string): string {
  const raw = (
    baseUrl ??
    process.env.GITLAB_URL ??
    process.env.TOPOLOGY_ISSUE_BASE_URL ??
    "https://gitlab.com"
  ).replace(/\/$/, "");
  if (raw.endsWith("/api/v4")) return raw;
  return `${raw}/api/v4`;
}

export function createGitlabScmFeedbackClient(
  config: ScmFeedbackClientConfig,
): ScmFeedbackClient {
  const apiBase = gitlabApiBase(config.baseUrl);
  const fetchImpl = config.fetch ?? fetch;

  function headers(): HeadersInit {
    return {
      "PRIVATE-TOKEN": config.token,
      Accept: "application/json",
      "Content-Type": "application/json",
    };
  }

  function projectPath(slug: string): string {
    return encodeURIComponent(slug);
  }

  async function readJson<T>(res: Response): Promise<T> {
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`GitLab HTTP ${res.status}: ${text.slice(0, 200)}`);
    }
    return text ? (JSON.parse(text) as T) : ({} as T);
  }

  return {
    async upsertCheckRun(input) {
      const project = projectPath(input.repoSlug);
      const state =
        input.conclusion === "success"
          ? "success"
          : input.conclusion === "failure"
            ? "failed"
            : "canceled";
      const res = await fetchImpl(
        `${apiBase}/projects/${project}/statuses/${encodeURIComponent(input.headSha)}`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({
            state,
            name: SCM_CHECK_NAME,
            description: input.title.slice(0, 255),
            target_url: input.detailsUrl,
          }),
        },
      );
      const data = await readJson<{ id: number }>(res);
      return { id: String(data.id) };
    },

    async upsertStickyComment(input) {
      const project = projectPath(input.repoSlug);
      const listUrl = `${apiBase}/projects/${project}/merge_requests/${input.prNumber}/notes?per_page=100`;
      const listed = await fetchImpl(listUrl, { headers: headers() });
      const notes = await readJson<
        Array<{ id: number; body?: string | null; system?: boolean }>
      >(listed);
      const existing = notes.find(
        (n) => !n.system && (n.body ?? "").includes(SCM_FEEDBACK_MARKER),
      );

      if (existing) {
        const res = await fetchImpl(
          `${apiBase}/projects/${project}/merge_requests/${input.prNumber}/notes/${existing.id}`,
          {
            method: "PUT",
            headers: headers(),
            body: JSON.stringify({ body: input.body }),
          },
        );
        const data = await readJson<{ id: number }>(res);
        return { id: String(data.id) };
      }

      const res = await fetchImpl(
        `${apiBase}/projects/${project}/merge_requests/${input.prNumber}/notes`,
        {
          method: "POST",
          headers: headers(),
          body: JSON.stringify({ body: input.body }),
        },
      );
      const data = await readJson<{ id: number }>(res);
      return { id: String(data.id) };
    },
  };
}

export function createScmFeedbackClient(
  provider: Repository["provider"],
  config: ScmFeedbackClientConfig,
): ScmFeedbackClient | null {
  if (provider === "github") return createGithubScmFeedbackClient(config);
  if (provider === "gitlab") return createGitlabScmFeedbackClient(config);
  return null;
}

export async function publishPreparedScmFeedback(input: {
  repository: RepositoryScmToggles;
  payload: ScmFeedbackPayload;
  client?: ScmFeedbackClient | null;
  token?: string | null;
}): Promise<ScmFeedbackPublishResult> {
  const wantsCheck = input.repository.postPrStatusChecks;
  const wantsComment = input.repository.postPrSummaryComment;
  if (!wantsCheck && !wantsComment) {
    return { skipped: true, reason: "toggles_disabled" };
  }

  const slug = parseScmRepoSlug(input.repository.remoteUrl);
  if (!slug) {
    return { skipped: true, reason: "invalid_remote_url" };
  }

  if (wantsCheck && !input.payload.commitSha?.trim()) {
    if (!wantsComment || input.payload.prNumber == null) {
      return { skipped: true, reason: "missing_commit_sha" };
    }
  }
  if (wantsComment && (input.payload.prNumber == null || input.payload.prNumber < 1)) {
    if (!wantsCheck || !input.payload.commitSha?.trim()) {
      return { skipped: true, reason: "missing_pr_number" };
    }
  }

  const client =
    input.client ??
    (() => {
      const token = input.token ?? resolveScmToken(input.repository.provider);
      if (!token) return null;
      return createScmFeedbackClient(input.repository.provider, {
        token,
        baseUrl:
          input.repository.provider === "github"
            ? process.env.GITHUB_API_URL
            : process.env.GITLAB_URL,
      });
    })();

  if (!client) {
    return { skipped: true, reason: "missing_credentials_or_provider" };
  }

  let checkRunId: string | undefined;
  let commentId: string | undefined;

  if (wantsCheck && input.payload.commitSha?.trim()) {
    const conclusion = scmCheckConclusion(
      input.payload.summary,
      input.payload.readiness,
    );
    const result = await client.upsertCheckRun({
      repoSlug: slug,
      headSha: input.payload.commitSha.trim(),
      conclusion,
      title: formatScmCheckTitle(input.payload.summary, input.payload.readiness),
      summaryMarkdown: formatScmCheckSummaryMarkdown(input.payload),
      detailsUrl: input.payload.runUrl,
      externalId: `topology-run-${input.payload.runId}`,
    });
    checkRunId = result.id;
  }

  if (
    wantsComment &&
    input.payload.prNumber != null &&
    input.payload.prNumber >= 1
  ) {
    const result = await client.upsertStickyComment({
      repoSlug: slug,
      prNumber: input.payload.prNumber,
      body: formatScmPrCommentBody(input.payload),
    });
    commentId = result.id;
  }

  return { skipped: false, checkRunId, commentId };
}

async function loadGapsForPr(
  workspaceId: string,
  prNumber: number | null,
  commitSha: string | null,
): Promise<ScmGapHint[]> {
  try {
    const { resolveAffectedPaths } = await import("@/lib/affected-resolve");
    const resolved = await resolveAffectedPaths(workspaceId, {
      ...(prNumber != null ? { pr: prNumber } : {}),
      ...(commitSha ? { commitSha } : {}),
    });
    if (!resolved.ok || resolved.paths.length === 0) return [];

    const { getWorkspaceImpact } = await import("@/lib/quality-graph/impact");
    const { impact } = await getWorkspaceImpact(workspaceId, resolved.paths);
    return impact.gaps.slice(0, 5).map((g) => ({
      key: g.key,
      title: g.title,
      kind: g.kind,
    }));
  } catch {
    return [];
  }
}

async function loadFlakeCount(
  results: Array<{ status: string; caseId: string | null }>,
): Promise<number> {
  try {
    const caseIds = [
      ...new Set(
        results
          .filter((r) => r.status === "failed" || r.status === "blocked")
          .map((r) => r.caseId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    if (caseIds.length === 0) return 0;
    const { getFlakeHintsForCaseIds } = await import("@/lib/queries/flake");
    const hints = await getFlakeHintsForCaseIds(caseIds);
    return [...hints.values()].filter((h) => h.isFlaky).length;
  } catch {
    return 0;
  }
}

async function loadReadiness(
  workspaceId: string,
): Promise<ScmReadinessSnippet> {
  try {
    const { getActiveMilestoneReadiness } = await import(
      "@/lib/queries/milestones"
    );
    const view = await getActiveMilestoneReadiness(workspaceId);
    if (!view) return null;
    return {
      milestoneName: view.milestone.name,
      status: view.readiness.status,
      badge: view.badge,
    };
  } catch {
    return null;
  }
}

/**
 * Build and publish GitHub/GitLab PR feedback for a completed run.
 * No-ops when the run is not linked to a commit/PR or toggles are off.
 */
export async function publishScmFeedbackForRun(
  runId: string,
): Promise<ScmFeedbackPublishResult> {
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
    with: {
      results: true,
      pullRequest: true,
      commit: true,
    },
  });
  if (!run) {
    return { skipped: true, reason: "run_not_found" };
  }

  const prNumber = run.pullRequest?.number ?? null;
  const commitSha = run.commitSha?.trim() || run.commit?.sha || null;
  if (!commitSha && prNumber == null) {
    return { skipped: true, reason: "not_pr_linked" };
  }

  let repository: Repository | null = null;
  if (run.pullRequestId) {
    const pr = await db.query.pullRequests.findFirst({
      where: eq(pullRequests.id, run.pullRequestId),
      with: { repository: true },
    });
    repository = pr?.repository ?? null;
  }
  if (!repository && run.commitId) {
    const commit = await db.query.commits.findFirst({
      where: eq(commits.id, run.commitId),
      with: { repository: true },
    });
    repository = commit?.repository ?? null;
  }
  if (!repository) {
    repository =
      (await db.query.repositories.findFirst({
        where: eq(repositories.workspaceId, run.workspaceId),
      })) ?? null;
  }
  if (!repository) {
    return { skipped: true, reason: "no_repository" };
  }

  if (!repository.postPrStatusChecks && !repository.postPrSummaryComment) {
    return { skipped: true, reason: "toggles_disabled" };
  }

  const resultRows = run.results.map((r) => ({
    status: r.status,
    caseId: r.caseId,
    errorMessage: r.errorMessage,
    stack: r.stack,
    notes: r.notes,
  }));

  const [flake, readiness, gaps] = await Promise.all([
    loadFlakeCount(resultRows),
    loadReadiness(run.workspaceId),
    loadGapsForPr(run.workspaceId, prNumber, commitSha),
  ]);

  const base = appBaseUrl();
  const payload: ScmFeedbackPayload = {
    runId: run.id,
    runName: run.name,
    commitSha,
    prNumber,
    summary: summarizeRunResults(resultRows, flake),
    signatures: signaturesFromResults(resultRows),
    gaps,
    readiness,
    runUrl: `${base}/runs/${run.id}`,
    reportUrl: `${base}/reports?run=${run.id}`,
  };

  return publishPreparedScmFeedback({
    repository,
    payload,
  });
}

/** Fire-and-forget wrapper used by CI completion routes. */
export function dispatchScmFeedbackForRun(runId: string): void {
  void publishScmFeedbackForRun(runId).catch(() => {});
}

export async function findRepositoryForWorkspace(
  workspaceId: string,
  repositoryId?: string,
): Promise<Repository | null> {
  if (repositoryId) {
    return (
      (await db.query.repositories.findFirst({
        where: and(
          eq(repositories.id, repositoryId),
          eq(repositories.workspaceId, workspaceId),
        ),
      })) ?? null
    );
  }
  return (
    (await db.query.repositories.findFirst({
      where: eq(repositories.workspaceId, workspaceId),
    })) ?? null
  );
}
