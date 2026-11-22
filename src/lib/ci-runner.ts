import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ciRunnerRequests, pullRequests, repositories } from "@/db/schema";

export type RunnerProvider = "github" | "gitlab";
type RunnerRequest = typeof ciRunnerRequests.$inferSelect;

const runnerVariables = {
  github: { token: "TOPOLOGY_GITHUB_RUNNER_TOKEN", targets: "TOPOLOGY_GITHUB_RUNNER_TARGETS" },
  gitlab: { token: "TOPOLOGY_GITLAB_RUNNER_TOKEN", targets: "TOPOLOGY_GITLAB_RUNNER_TARGETS" },
} as const;

const targetSchema = z.object({
  repositoryId: z.uuid(),
  workflow: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,119}$/),
  ref: z.string().min(1).max(200),
  environments: z.array(z.string().min(1).max(120)).min(1),
  reporterTokenId: z.uuid(),
});
const githubTargetSchema = targetSchema.extend({
  workflow: z.string().regex(/^(?:[1-9][0-9]*|[a-zA-Z0-9_.-]+\.ya?ml)$/),
});

export function isRunnerProvider(provider: string): provider is RunnerProvider {
  return provider === "github" || provider === "gitlab";
}

export function runnerToken(provider: RunnerProvider) {
  return process.env[runnerVariables[provider].token]?.trim();
}

export function findRunnerTarget(provider: RunnerProvider, repositoryId: string, workflow: string, environment: string) {
  const raw = process.env[runnerVariables[provider].targets];
  if (!raw) return;
  const targets = z.array(provider === "github" ? githubTargetSchema : targetSchema).max(100).parse(JSON.parse(raw));
  const matches = targets.filter((target) => target.repositoryId === repositoryId && target.workflow === workflow);
  if (matches.length > 1) throw new Error("Duplicate CI workflow targets");
  return matches.find((target) => target.environments.includes(environment));
}

/** Remotes supply only a repository path. API requests use fixed provider hosts. */
export function cloudRepository(provider: RunnerProvider, remoteUrl: string): string | null {
  const match = provider === "github"
    ? /^(?:https:\/\/github\.com\/|git@github\.com:)([a-z0-9_.-]+\/[a-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(remoteUrl)
    : /^(?:https:\/\/gitlab\.com\/|git@gitlab\.com:)((?:[a-z0-9_.-]+\/)+[a-z0-9_.-]+?)(?:\.git)?\/?$/i.exec(remoteUrl);
  if (!match || match[1].split("/").some((part) => part === "." || part === ".." || part === "-")) return null;
  return match[1];
}

class RunnerDispatchError extends Error {
  constructor(readonly outcome: "rejected" | "unknown", message: string) {
    super(message);
  }
}

const commitShaSchema = z.string().regex(/^[a-f0-9]{40}$/);
const githubDetails = z.object({
  state: z.literal("open"),
  draft: z.literal(false),
  head: z.object({ sha: commitShaSchema, repo: z.object({ full_name: z.string() }) }),
});
const gitlabDetails = z.object({
  state: z.literal("opened"),
  draft: z.literal(false),
  sha: commitShaSchema,
  source_project_id: z.number().int().positive(),
  target_project_id: z.number().int().positive(),
});
const providerRunIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const githubReceipt = z.object({ workflow_run_id: providerRunIdSchema });
const gitlabReceipt = z.object({ id: providerRunIdSchema });

function providerOptions(provider: RunnerProvider, token: string): RequestInit {
  return {
    headers: new Headers(provider === "github" ? {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
    } : {
      Accept: "application/json",
      "PRIVATE-TOKEN": token,
      "Content-Type": "application/json",
    }),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  };
}

function projectApi(provider: RunnerProvider, repository: string) {
  return provider === "github"
    ? `https://api.github.com/repos/${repository.split("/").map(encodeURIComponent).join("/")}`
    : `https://gitlab.com/api/v4/projects/${encodeURIComponent(repository)}`;
}

export async function verifyWorkflowHead(
  provider: RunnerProvider,
  repository: string,
  changeNumber: number,
  commitSha: string,
  token: string,
) {
  const changes = provider === "github" ? "pulls" : "merge_requests";
  const response = await fetch(
    `${projectApi(provider, repository)}/${changes}/${changeNumber}`,
    providerOptions(provider, token),
  );
  if (!response.ok) throw new RunnerDispatchError("rejected", "Could not confirm the change on its provider");
  const details: unknown = await response.json();
  if (provider === "gitlab") {
    const mr = gitlabDetails.safeParse(details);
    if (mr.success && mr.data.sha === commitSha && mr.data.source_project_id === mr.data.target_project_id) return;
  } else {
    const pr = githubDetails.safeParse(details);
    if (pr.success && pr.data.head.sha === commitSha && pr.data.head.repo.full_name.toLowerCase() === repository.toLowerCase()) return;
  }
  throw new RunnerDispatchError("rejected", "The pull request must be ready, current, and from the approved repository");
}

async function sendWorkflowDispatch(
  provider: RunnerProvider,
  request: RunnerRequest,
  repository: string,
  changeNumber: number,
  token: string,
) {
  await verifyWorkflowHead(provider, repository, changeNumber, request.commitSha, token);
  const api = projectApi(provider, repository);
  const inputs = {
    topology_request_id: request.id,
    topology_commit_sha: request.commitSha,
    topology_environment: request.environment,
  };
  const path = provider === "github"
    ? `/actions/workflows/${encodeURIComponent(request.workflow)}/dispatches`
    : `/pipeline?${new URLSearchParams({ ref: request.ref })}`;
  const response = await fetch(api + path, {
    ...providerOptions(provider, token),
    method: "POST",
    body: JSON.stringify(provider === "github"
      ? { ref: request.ref, inputs }
      : { inputs: { ...inputs, topology_workflow: request.workflow } }),
  });
  if (!response.ok) {
    const rejected = [400, 401, 403, 404, 422].includes(response.status);
    const name = provider === "github" ? "GitHub" : "GitLab";
    throw new RunnerDispatchError(rejected ? "rejected" : "unknown", `${name} returned HTTP ${response.status}`);
  }
  const json: unknown = await response.json().catch(() => null);
  const id = provider === "github" ? githubReceipt.safeParse(json).data?.workflow_run_id : gitlabReceipt.safeParse(json).data?.id;
  if (!id) throw new RunnerDispatchError("unknown", "The provider did not return a workflow run ID");
  return String(id);
}

export async function dispatchQueuedRun(requestId: string, workspaceId: string) {
  const [request] = await db.update(ciRunnerRequests).set({
    status: "dispatching", updatedAt: new Date(),
  }).where(and(
    eq(ciRunnerRequests.id, requestId),
    eq(ciRunnerRequests.workspaceId, workspaceId),
    eq(ciRunnerRequests.status, "queued"),
  )).returning();
  if (!request) return;

  let status: RunnerRequest["status"] = "dispatched";
  let detail: string | null = null;
  let providerRunId: string | null = null;
  try {
    const [context] = await db.select({
      remoteUrl: repositories.remoteUrl,
      provider: repositories.provider,
      pr: pullRequests.number,
      headSha: pullRequests.headSha,
    }).from(pullRequests).innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId)).where(and(
      eq(repositories.workspaceId, workspaceId),
      eq(repositories.id, request.repositoryId),
      eq(pullRequests.id, request.pullRequestId),
    ));
    if (!context || !isRunnerProvider(context.provider)) {
      throw new RunnerDispatchError("rejected", "The CI repository is unavailable");
    }
    const { provider } = context;
    const target = findRunnerTarget(provider, request.repositoryId, request.workflow, request.environment);
    const token = runnerToken(provider);
    const repository = cloudRepository(provider, context.remoteUrl);
    if (context.headSha !== request.commitSha || !target || target.ref !== request.ref ||
        target.reporterTokenId !== request.reporterTokenId || !token || !repository) {
      throw new RunnerDispatchError("rejected", "The repository, head commit, or allowed workflow configuration changed");
    }
    providerRunId = await sendWorkflowDispatch(provider, request, repository, context.pr, token);
  } catch (error) {
    status = error instanceof RunnerDispatchError ? error.outcome : "unknown";
    detail = error instanceof RunnerDispatchError ? error.message : "Dispatch outcome could not be confirmed";
  }
  await db.update(ciRunnerRequests).set({ status, detail, providerRunId, updatedAt: new Date() }).where(and(
    eq(ciRunnerRequests.id, request.id),
    eq(ciRunnerRequests.status, "dispatching"),
  ));
}

export async function readRunnerRequest(workspaceId: string, requestId: string) {
  const [row] = await db.select({
    id: ciRunnerRequests.id,
    commitSha: ciRunnerRequests.commitSha,
    environment: ciRunnerRequests.environment,
    workflow: ciRunnerRequests.workflow,
    providerRunId: ciRunnerRequests.providerRunId,
    topologyRunId: ciRunnerRequests.topologyRunId,
    status: ciRunnerRequests.status,
    detail: ciRunnerRequests.detail,
    caseRevisions: ciRunnerRequests.caseRevisions,
    updatedAt: ciRunnerRequests.updatedAt,
    headSha: pullRequests.headSha,
    remoteUrl: repositories.remoteUrl,
    provider: repositories.provider,
  }).from(ciRunnerRequests)
    .innerJoin(pullRequests, eq(pullRequests.id, ciRunnerRequests.pullRequestId))
    .innerJoin(repositories, eq(repositories.id, ciRunnerRequests.repositoryId))
    .where(and(eq(ciRunnerRequests.id, requestId), eq(ciRunnerRequests.workspaceId, workspaceId)));
  if (!row) return null;
  const { remoteUrl, headSha, ...request } = row;
  const repo = isRunnerProvider(row.provider) ? cloudRepository(row.provider, remoteUrl) : null;
  let providerHref = null;
  if (row.providerRunId && repo) {
    providerHref = row.provider === "github"
      ? `https://github.com/${repo}/actions/runs/${row.providerRunId}`
      : `https://gitlab.com/${repo}/-/pipelines/${row.providerRunId}`;
  }
  return {
    ...request,
    status: row.status === "dispatching" && Date.now() - row.updatedAt.getTime() > 60_000 ? "unknown" : row.status,
    stale: row.commitSha !== headSha,
    evidenceHref: row.topologyRunId ? `/reports/${row.topologyRunId}` : null,
    providerHref,
  };
}
