import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { githubRunnerRequests, pullRequests, repositories } from "@/db/schema";


const targetSchema = z.object({
  repositoryId: z.uuid(),
  workflow: z.string().regex(/^(?:[1-9][0-9]*|[a-zA-Z0-9_.-]+\.ya?ml)$/),
  ref: z.string().min(1).max(200),
  environments: z.array(z.string().min(1).max(120)).min(1),
  reporterTokenId: z.uuid(),
});
type Target = z.infer<typeof targetSchema>;
export type RunnerRequest = typeof githubRunnerRequests.$inferSelect;

export function runnerTargets(): Target[] {
  const raw = process.env.TOPOLOGY_GITHUB_RUNNER_TARGETS;
  if (!raw) return [];
  const targets = z.array(targetSchema).max(100).parse(JSON.parse(raw));
  const ids = new Set(targets.map(({ repositoryId, workflow }) => `${repositoryId}:${workflow}`));
  if (ids.size !== targets.length) throw new Error("Duplicate GitHub workflow targets");
  return targets;
}

export function githubCloudRepository(remoteUrl: string): string | null {
  const match = /^(?:https:\/\/github\.com\/|git@github\.com:)([a-z0-9_.-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(remoteUrl);
  if (!match || match.slice(1).some((part) => part === "." || part === "..")) return null;
  return `${encodeURIComponent(match[1])}/${encodeURIComponent(match[2])}`;
}

export class RunnerDispatchError extends Error {
  constructor(readonly outcome: "rejected" | "unknown", message: string) {
    super(message);
  }
}

const prDetails = z.object({
  state: z.literal("open"),
  draft: z.literal(false),
  head: z.object({
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    repo: z.object({ full_name: z.string() }),
  }),
});
const dispatchReceipt = z.object({ workflow_run_id: z.number().int().positive().max(Number.MAX_SAFE_INTEGER) });

function githubOptions(token: string) {
  return {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    redirect: "error" as const,
    signal: AbortSignal.timeout(10_000),
  };
}

export async function verifyGithubPullRequest(
  repository: string,
  pullRequestNumber: number,
  commitSha: string,
  token: string,
  fetchImpl = fetch,
) {
  const current = await fetchImpl(
    `https://api.github.com/repos/${repository}/pulls/${pullRequestNumber}`,
    githubOptions(token),
  );
  if (!current.ok) throw new RunnerDispatchError("rejected", "Could not confirm the pull request on GitHub");
  const pr = prDetails.safeParse(await current.json());
  if (!pr.success || pr.data.head.sha !== commitSha ||
      pr.data.head.repo.full_name.toLowerCase() !== decodeURIComponent(repository).toLowerCase()) {
    throw new RunnerDispatchError("rejected", "The pull request must be ready, current, and from the approved repository");
  }
}

export async function sendGithubDispatch(
  request: Pick<RunnerRequest, "id" | "workflow" | "ref" | "environment" | "commitSha">,
  repository: string,
  pullRequestNumber: number,
  token: string,
  fetchImpl = fetch,
): Promise<string> {
  await verifyGithubPullRequest(repository, pullRequestNumber, request.commitSha, token, fetchImpl);
  const base = `https://api.github.com/repos/${repository}`;
  const response = await fetchImpl(`${base}/actions/workflows/${encodeURIComponent(request.workflow)}/dispatches`, {
    ...githubOptions(token),
    method: "POST",
    body: JSON.stringify({
      ref: request.ref,
      inputs: {
        topology_request_id: request.id,
        topology_commit_sha: request.commitSha,
        topology_environment: request.environment,
      },
    }),
  });
  if (!response.ok) {
    const knownRejection = [400, 401, 403, 404, 422].includes(response.status);
    throw new RunnerDispatchError(knownRejection ? "rejected" : "unknown", `GitHub returned HTTP ${response.status}`);
  }
  const receipt = dispatchReceipt.safeParse(await response.json().catch(() => null));
  if (!receipt.success) throw new RunnerDispatchError("unknown", "GitHub did not return a workflow run ID");
  return String(receipt.data.workflow_run_id);
}

export async function dispatchQueuedGithubRun(requestId: string, workspaceId: string) {
  const [request] = await db.update(githubRunnerRequests).set({
    status: "dispatching", updatedAt: new Date(),
  }).where(and(
    eq(githubRunnerRequests.id, requestId),
    eq(githubRunnerRequests.workspaceId, workspaceId),
    eq(githubRunnerRequests.status, "queued"),
  )).returning();
  if (!request) return;

  let status: RunnerRequest["status"] = "dispatched";
  let detail: string | null = null;
  let providerRunId: string | null = null;
  try {
    const [context] = await db.select({
      remoteUrl: repositories.remoteUrl,
      pr: pullRequests.number,
      headSha: pullRequests.headSha,
    }).from(pullRequests).innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId)).where(and(
      eq(repositories.workspaceId, workspaceId),
      eq(repositories.id, request.repositoryId),
      eq(pullRequests.id, request.pullRequestId),
    ));
    const target = runnerTargets().find((candidate) =>
      candidate.repositoryId === request.repositoryId && candidate.workflow === request.workflow &&
      candidate.ref === request.ref && candidate.reporterTokenId === request.reporterTokenId &&
      candidate.environments.includes(request.environment),
    );
    const token = process.env.TOPOLOGY_GITHUB_RUNNER_TOKEN?.trim();
    const repository = context && githubCloudRepository(context.remoteUrl);
    if (!context || context.headSha !== request.commitSha || !target || !token || !repository) {
      throw new RunnerDispatchError("rejected", "The repository, head commit, or allowed workflow configuration changed");
    }
    providerRunId = await sendGithubDispatch(request, repository, context.pr, token);
  } catch (err) {
    status = err instanceof RunnerDispatchError ? err.outcome : "unknown";
    detail = err instanceof RunnerDispatchError ? err.message : "Dispatch outcome could not be confirmed";
  }
  await db.update(githubRunnerRequests).set({ status, detail, providerRunId, updatedAt: new Date() }).where(and(
    eq(githubRunnerRequests.id, request.id),
    eq(githubRunnerRequests.status, "dispatching"),
  ));
}

export async function readGithubRunnerRequest(workspaceId: string, requestId: string) {
  const [row] = await db.select({
    id: githubRunnerRequests.id,
    commitSha: githubRunnerRequests.commitSha,
    environment: githubRunnerRequests.environment,
    workflow: githubRunnerRequests.workflow,
    providerRunId: githubRunnerRequests.providerRunId,
    topologyRunId: githubRunnerRequests.topologyRunId,
    status: githubRunnerRequests.status,
    detail: githubRunnerRequests.detail,
    caseRevisions: githubRunnerRequests.caseRevisions,
    updatedAt: githubRunnerRequests.updatedAt,
    headSha: pullRequests.headSha,
    remoteUrl: repositories.remoteUrl,
  }).from(githubRunnerRequests)
    .innerJoin(pullRequests, eq(pullRequests.id, githubRunnerRequests.pullRequestId))
    .innerJoin(repositories, eq(repositories.id, githubRunnerRequests.repositoryId))
    .where(and(eq(githubRunnerRequests.id, requestId), eq(githubRunnerRequests.workspaceId, workspaceId)));
  if (!row) return null;
  const { remoteUrl, headSha, ...request } = row;
  const repo = githubCloudRepository(remoteUrl);
  return {
    ...request,
    status: row.status === "dispatching" && Date.now() - row.updatedAt.getTime() > 60_000 ? "unknown" : row.status,
    stale: row.commitSha !== headSha,
    evidenceHref: row.topologyRunId ? `/reports/${row.topologyRunId}` : null,
    providerHref: row.providerRunId && repo ? `https://github.com/${repo}/actions/runs/${row.providerRunId}` : null,
  };
}
