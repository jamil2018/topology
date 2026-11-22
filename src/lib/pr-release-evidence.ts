import { createHash } from "node:crypto";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  auditEvents, cases, githubRunnerRequests, prReleaseSignoffs, pullRequests,
  repositories, runResults,
} from "@/db/schema";
import { githubCloudRepository, verifyGithubPullRequest } from "@/lib/github-runner";
import { currentCaseRevisions } from "@/lib/case-revision";

const policySchema = z.object({
  repositoryId: z.uuid(),
  version: z.string().min(1).max(120),
  workflow: z.string().min(1).max(120),
  environments: z.array(z.string().min(1).max(120)).min(1).max(20),
  caseKeys: z.array(z.string().min(1).max(64)).min(1).max(50),
});
type Executor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

function releasePolicy(repositoryId: string) {
  const raw = process.env.TOPOLOGY_GITHUB_RELEASE_POLICIES;
  if (!raw) return null;
  const matches = z.array(policySchema).max(100).parse(JSON.parse(raw))
    .filter((policy) => policy.repositoryId === repositoryId);
  if (matches.length !== 1) return null;
  const [policy] = matches;
  return {
    ...policy,
    environments: [...new Set(policy.environments)].sort(),
    caseKeys: [...new Set(policy.caseKeys)].sort(),
  };
}

export async function readPrReleaseEvidence(workspaceId: string, prId: string, executor: Executor = db) {
  const [pr] = await executor.select({
    id: pullRequests.id,
    number: pullRequests.number,
    commitSha: pullRequests.headSha,
    repositoryId: repositories.id,
  }).from(pullRequests).innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
    .where(and(eq(pullRequests.id, prId), eq(repositories.workspaceId, workspaceId)));
  if (!pr) return null;

  const policy = releasePolicy(pr.repositoryId);
  if (!policy || !pr.commitSha) {
    return { ...pr, state: !policy ? "policy_missing" as const : "head_unknown" as const };
  }

  const scope = and(
    eq(githubRunnerRequests.workspaceId, workspaceId),
    eq(githubRunnerRequests.pullRequestId, pr.id),
    eq(githubRunnerRequests.workflow, policy.workflow),
    inArray(githubRunnerRequests.environment, policy.environments),
  );
  const [catalog, current, older] = await Promise.all([
    executor.select({ id: cases.id, key: cases.key }).from(cases).where(and(
      eq(cases.workspaceId, workspaceId), inArray(cases.key, policy.caseKeys),
    )),
    executor.selectDistinctOn([githubRunnerRequests.environment], {
      id: githubRunnerRequests.id,
      environment: githubRunnerRequests.environment,
      status: githubRunnerRequests.status,
      topologyRunId: githubRunnerRequests.topologyRunId,
      providerRunId: githubRunnerRequests.providerRunId,
      caseRevisions: githubRunnerRequests.caseRevisions,
    }).from(githubRunnerRequests).where(and(scope, eq(githubRunnerRequests.commitSha, pr.commitSha)))
      .orderBy(asc(githubRunnerRequests.environment), desc(githubRunnerRequests.createdAt), desc(githubRunnerRequests.id)),
    executor.selectDistinctOn([githubRunnerRequests.environment], {
      environment: githubRunnerRequests.environment,
      id: githubRunnerRequests.id,
      commitSha: githubRunnerRequests.commitSha,
    }).from(githubRunnerRequests).where(and(scope, ne(githubRunnerRequests.commitSha, pr.commitSha)))
      .orderBy(asc(githubRunnerRequests.environment), desc(githubRunnerRequests.createdAt), desc(githubRunnerRequests.id)),
  ]);
  const revisions = new Map((await currentCaseRevisions(workspaceId, catalog.map(({ id }) => id), executor))
    .map(({ key, id, revision }) => [key, { id, revision }]));
  const runIds = current.flatMap((request) => request.topologyRunId ? [request.topologyRunId] : []);
  const rows = runIds.length ? await executor.select({
    id: runResults.id, runId: runResults.runId, caseId: runResults.caseId, status: runResults.status,
    caseRevision: runResults.caseRevision, match: runResults.evidenceMatch,
  }).from(runResults).where(inArray(runResults.runId, runIds)).orderBy(asc(runResults.id)) : [];
  const matrix = policy.environments.flatMap((environment) => {
    const request = current.find((row) => row.environment === environment);
    const ignored = older.find((row) => row.environment === environment);
    const results = rows.filter((row) => row.runId === request?.topologyRunId);
    const unmatched = results.filter((row) => row.match === "ambiguous" || row.match === "unmapped");
    return policy.caseKeys.map((key) => {
      const selected = revisions.get(key);
      const planned = request?.caseRevisions.find((row) => row.id === selected?.id);
      const matching = results.filter((row) => row.caseId === selected?.id && row.match === "matched" && row.caseRevision === selected?.revision);
      const status = !selected ? "case_unavailable"
        : !request ? (ignored ? "stale_commit" : "not_requested")
        : request.status !== "ingested" || !request.topologyRunId ? "unverified"
        : !planned ? "not_selected"
        : planned.revision !== selected.revision ? "stale_revision"
        : !matching.length ? (unmatched.some((row) => row.match === "ambiguous") ? "ambiguous" : "missing_result")
        : matching.every((row) => row.status === "passed") ? "passed"
        : "not_passing";
      return {
        caseKey: key, caseId: selected?.id ?? null, revision: selected?.revision ?? null, environment, status,
        requestId: request?.id ?? null, requestStatus: request?.status ?? null,
        runId: request?.topologyRunId ?? null,
        providerRunId: request?.providerRunId ?? null,
        reportHref: request?.topologyRunId ? `/reports/${request.topologyRunId}` : null,
        resultIds: matching.map(({ id }) => id),
        unmappedResultIds: unmatched.map(({ id }) => id),
        staleRequest: request ? null : ignored ?? null,
      };
    });
  });
  const eligible = matrix.every(({ status }) => status === "passed");
  const digest = createHash("sha256").update(JSON.stringify({ pr, policy, matrix })).digest("hex");
  const signed = eligible ? await executor.query.prReleaseSignoffs.findFirst({
    where: and(eq(prReleaseSignoffs.pullRequestId, pr.id), eq(prReleaseSignoffs.digest, digest)),
    columns: { id: true, actorId: true, createdAt: true },
  }) : null;
  return {
    ...pr, policy, digest, matrix, eligible, signoff: signed ?? null,
    state: signed ? "signed" as const : eligible ? "awaiting_signoff" as const : "evidence_incomplete" as const,
  };
}

export class EvidenceChangedError extends Error {}

export async function signPrReleaseEvidence(input: { workspaceId: string; pullRequestId: string; digest: string; actorId: string }) {
  return db.transaction(async (tx) => {
    const [pr] = await tx.select({ id: pullRequests.id, remoteUrl: repositories.remoteUrl }).from(pullRequests)
      .innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
      .where(and(eq(pullRequests.id, input.pullRequestId), eq(repositories.workspaceId, input.workspaceId)))
      .for("update", { of: pullRequests });
    if (!pr) return null;

    const report = await readPrReleaseEvidence(input.workspaceId, input.pullRequestId, tx);
    if (!report || !("digest" in report) || !report.eligible || report.digest !== input.digest || !report.commitSha) {
      throw new EvidenceChangedError("Evidence must pass the current policy and match the reviewed report");
    }
    const repository = githubCloudRepository(pr.remoteUrl);
    const token = process.env.TOPOLOGY_GITHUB_RUNNER_TOKEN?.trim();
    if (!repository || !token) throw new EvidenceChangedError("GitHub access is required to confirm the release commit");
    try {
      await verifyGithubPullRequest(repository, report.number, report.commitSha, token);
    } catch {
      throw new EvidenceChangedError("Could not confirm that the reviewed commit is the current GitHub PR head");
    }
    if (report.signoff) return report.signoff;

    const [row] = await tx.insert(prReleaseSignoffs).values({
      workspaceId: input.workspaceId, pullRequestId: input.pullRequestId, digest: input.digest,
      commitSha: report.commitSha, actorId: input.actorId, evidence: report,
    }).returning({ id: prReleaseSignoffs.id, actorId: prReleaseSignoffs.actorId, createdAt: prReleaseSignoffs.createdAt });
    await tx.insert(auditEvents).values({
      action: "release.evidence.signoff",
      workspaceId: input.workspaceId, actorId: input.actorId,
      targetType: "pull_request", targetId: input.pullRequestId,
      metadataJson: JSON.stringify({ signoffId: row.id, digest: input.digest, policyVersion: report.policy.version, commitSha: report.commitSha }),
    });
    return row;
  });
}
