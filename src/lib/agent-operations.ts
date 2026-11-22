import { createHash } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { agentEvidenceMaxBytes, agentEvidenceSchema, validateProposalPayload } from "@topology/domain";
import { db } from "@/db";
import {
  agentOperations,
  apiTokens,
  attachments,
  auditEvents,
  cases,
  githubRunnerRequests,
  notifications,
  pullRequests,
  repositories,
  resultStatusEnum,
  runResults,
  runs,
  runStepResults,
  workspaceMembers,
  workspaces,
  type Proposal,
} from "@/db/schema";
import type { ApiTokenScope } from "@/lib/api-token-scopes";
import { requireWorkspaceAssignee } from "@/lib/assignee";
import { inferAttachmentKind, storeAttachmentFile } from "@/lib/attachments";
import { createRetestRun } from "@/lib/retest";
import { currentCaseRevisions } from "@/lib/case-revision";
import { dispatchQueuedGithubRun, githubCloudRepository, runnerTargets } from "@/lib/github-runner";
import { openTriageForResult } from "@/lib/ci-ingest";
import { emitLive, type LiveEvent } from "@/lib/live";
import { createProposal, notifyProposalCreated, toProposalListItem } from "@/lib/proposals";
import { isRunFrozen } from "@/lib/run-immutability";
import { seedManualRunResults } from "@/lib/tcm/seed-run";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type AgentActor = {
  workspaceId: string;
  tokenId: string | null;
  userId: string | null;
  scopes: ApiTokenScope[];
};

const operationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("propose_coverage"),
    payload: z.unknown(),
    entityType: z.string().trim().min(1).max(64).optional(),
    model: z.string().max(120).optional(),
    inputRefs: z.array(z.string().max(1000)).max(50).optional(),
  }),
  z.object({
    action: z.literal("create_run"),
    name: z.string().trim().min(1).max(240),
    description: z.string().max(10_000).optional(),
    caseIds: z.array(z.uuid()).min(1).max(500),
    environment: z.string().trim().min(1).max(120).optional(),
  }),
  z.object({
    action: z.literal("create_retest"),
    name: z.string().trim().min(1).max(200),
    description: z.string().max(20_000).default(""),
    environment: z.string().trim().min(1).max(120).default("local"),
    sourceResultIds: z.array(z.uuid()).min(1).max(500),
  }),
  z.object({
    action: z.literal("handoff_run"),
    runId: z.uuid(),
    assigneeId: z.uuid(),
    notes: z.string().trim().min(1).max(2000),
  }),
  z.object({
    action: z.literal("request_workflow"),
    caseIds: z.array(z.uuid()).min(1).max(50),
    pullRequestId: z.uuid(),
    commitSha: z.string().regex(/^[0-9a-f]{40}$/),
    workflow: z.string().min(1).max(120),
    environment: z.string().min(1).max(120),
  }),
  z.object({
    action: z.literal("record_result"),
    runId: z.uuid(),
    resultId: z.uuid(),
    stepResultId: z.uuid().optional(),
    status: z.enum(resultStatusEnum.enumValues),
    notes: z.string().max(20_000).optional(),
    sourceRefs: z.array(z.string().max(1000)).max(50).optional(),
    evidence: agentEvidenceSchema.optional(),
  }),
]);

type Operation = z.infer<typeof operationSchema>;
const capability = {
  propose_coverage: "agent-propose",
  create_run: "agent-run",
  create_retest: "agent-run",
  handoff_run: "agent-observe",
  request_workflow: "agent-run",
  record_result: "agent-observe",
} as const satisfies Record<Operation["action"], ApiTokenScope>;

export class AgentOperationError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

type Effect = {
  status: number;
  body: Record<string, unknown>;
  targetType: string;
  targetId: string;
  sourceRefs?: string[];
  proposal?: Proposal;
  event?: Omit<LiveEvent, "at">;
};

async function applyOperation(
  tx: Transaction,
  workspaceId: string,
  userId: string,
  operation: Operation,
  operationIdentity: string,
): Promise<Effect> {
  if (operation.action === "propose_coverage") {
    const validated = validateProposalPayload(operation.payload);
    if (!validated.ok) {
      throw new AgentOperationError(400, "INVALID_PROPOSAL", validated.issues.map(({ path, message }) => `${path} ${message}`).join(", "));
    }
    const row = await createProposal({
      ...operation,
      workspaceId,
      payload: validated.payload,
      actorType: "agent",
      createdById: userId,
    }, tx);
    return {
      status: 201,
      body: { proposal: toProposalListItem(row), href: "/proposals" },
      targetType: "proposal",
      targetId: row.id,
      sourceRefs: operation.inputRefs,
      proposal: row,
    };
  }

  if (operation.action === "create_run") {
    const caseIds = [...new Set(operation.caseIds)];
    const eligible = await tx.select({ id: cases.id }).from(cases).where(and(
      eq(cases.workspaceId, workspaceId),
      eq(cases.status, "ready"),
      inArray(cases.id, caseIds),
    )).for("share");
    if (eligible.length !== caseIds.length) {
      throw new AgentOperationError(409, "CASES_UNAVAILABLE", "Select ready cases from the current project");
    }
    const [run] = await tx.insert(runs).values({
      workspaceId,
      name: operation.name,
      description: operation.description,
      environment: operation.environment,
      source: "agent",
      assigneeId: userId,
      createdById: userId,
    }).returning();
    await seedManualRunResults({ workspaceId, runId: run.id, caseIds }, tx);
    return {
      status: 201,
      body: { run, caseCount: caseIds.length, href: `/runs/${run.id}` },
      targetType: "run",
      targetId: run.id,
    };
  }

  if (operation.action === "create_retest") {
    const run = await createRetestRun({
      ...operation, workspaceId, actorId: userId, assigneeId: userId, readyOnly: true,
    }, tx);
    if (!run) throw new AgentOperationError(409, "RETEST_UNAVAILABLE", "The retest needs failed or blocked results linked to ready cases");
    return {
      status: 201,
      body: { run, href: `/runs/${run.id}` },
      targetType: "run",
      targetId: run.id,
      sourceRefs: operation.sourceResultIds,
    };
  }

  if (operation.action === "request_workflow") {
    const [pr] = await tx.select({
      id: pullRequests.id,
      repositoryId: repositories.id,
      headSha: pullRequests.headSha,
      status: pullRequests.status,
      remoteUrl: repositories.remoteUrl,
    }).from(pullRequests).innerJoin(repositories, eq(repositories.id, pullRequests.repositoryId))
      .where(and(
        eq(pullRequests.id, operation.pullRequestId),
        eq(repositories.workspaceId, workspaceId),
        eq(repositories.provider, "github"),
      )).for("share");
    if (!pr) throw new AgentOperationError(404, "PULL_REQUEST_NOT_FOUND", "GitHub pull request not found");
    if (pr.status !== "open" || pr.headSha !== operation.commitSha) {
      throw new AgentOperationError(409, "STALE_HEAD", "Refresh the open pull request and use its current head commit");
    }
    const target = runnerTargets().find((policy) =>
      policy.repositoryId === pr.repositoryId && policy.workflow === operation.workflow &&
      policy.environments.includes(operation.environment),
    );
    if (!target || !githubCloudRepository(pr.remoteUrl) || !process.env.TOPOLOGY_GITHUB_RUNNER_TOKEN?.trim()) {
      throw new AgentOperationError(403, "WORKFLOW_NOT_APPROVED", "This workflow or environment is unavailable to agents");
    }
    const reporter = await tx.query.apiTokens.findFirst({ where: and(
      eq(apiTokens.id, target.reporterTokenId),
      eq(apiTokens.workspaceId, workspaceId),
      sql`${apiTokens.revokedAt} is null and (${apiTokens.expiresAt} is null or ${apiTokens.expiresAt} > now())`,
    ) });
    if (!reporter || !reporter.scope.split(",").includes("ci-write")) {
      throw new AgentOperationError(409, "REPORTER_UNAVAILABLE", "The approved workflow needs a current reporting token");
    }
    const selected = [...new Set(operation.caseIds)];
    const caseRevisions = await currentCaseRevisions(workspaceId, selected, tx);
    if (caseRevisions.length !== selected.length) {
      throw new AgentOperationError(409, "CASES_UNAVAILABLE", "Select ready cases from the current project");
    }
    const [request] = await tx.insert(githubRunnerRequests).values({
      workspaceId,
      repositoryId: pr.repositoryId,
      pullRequestId: pr.id,
      reporterTokenId: reporter.id,
      commitSha: operation.commitSha,
      workflow: target.workflow,
      caseRevisions,
      ref: target.ref,
      environment: operation.environment,
    }).returning();
    return {
      status: 202,
      body: {
        requestId: request.id,
        href: `/api/v1/agent?resource=workflow_request&id=${request.id}`,
      },
      targetType: "github_runner_request",
      targetId: request.id,
      sourceRefs: [pr.id, request.commitSha],
    };
  }

  const [run] = await tx.select().from(runs).where(and(
    eq(runs.id, operation.runId),
    eq(runs.workspaceId, workspaceId),
  )).for("update");
  if (!run) throw new AgentOperationError(404, "RUN_NOT_FOUND", "Run not found");
  if (isRunFrozen(run.status) || run.kind !== "manual") {
    throw new AgentOperationError(409, "RUN_IMMUTABLE", "The run does not accept manual observations");
  }
  if (operation.action === "handoff_run") {
    if (run.assigneeId !== userId) {
      throw new AgentOperationError(403, "RUN_NOT_ASSIGNED", "Only the assigned agent credential owner can hand off this run");
    }
    if (operation.assigneeId === userId) {
      throw new AgentOperationError(400, "INVALID_ASSIGNEE", "Choose a different project member for the handoff");
    }
    const assignee = await requireWorkspaceAssignee(workspaceId, operation.assigneeId, "runs.edit", tx);
    if (!assignee.ok) throw new AgentOperationError(assignee.status, "INVALID_ASSIGNEE", assignee.error);
    const [updated] = await tx.update(runs).set({
      assigneeId: operation.assigneeId, updatedAt: new Date(),
    }).where(eq(runs.id, run.id)).returning();
    await tx.insert(notifications).values({
      workspaceId, userId: operation.assigneeId,
      type: "assignment", title: `Run handed off: ${run.name}`, body: operation.notes,
      entityType: "run", entityId: run.id,
    });
    return {
      status: 200,
      body: { run: updated, href: `/runs/${run.id}` },
      targetType: "run", targetId: run.id, sourceRefs: [operation.assigneeId],
    };
  }

  const [result] = await tx.select().from(runResults).where(and(
    eq(runResults.id, operation.resultId),
    eq(runResults.runId, run.id),
  )).for("update");
  if (!result) throw new AgentOperationError(404, "RESULT_NOT_FOUND", "Result not found");
  if ((result.assigneeId ?? run.assigneeId) !== userId) {
    throw new AgentOperationError(403, "RESULT_NOT_ASSIGNED", "The result must be assigned to the agent credential owner");
  }

  let body: Record<string, unknown>;
  if (operation.stepResultId) {
    const [step] = await tx.update(runStepResults).set({
      status: operation.status,
      notes: operation.notes,
    }).where(and(
      eq(runStepResults.id, operation.stepResultId),
      eq(runStepResults.resultId, result.id),
    )).returning();
    if (!step) throw new AgentOperationError(404, "STEP_NOT_FOUND", "Step result not found");
    body = { step };
  } else {
    const [updated] = await tx.update(runResults).set({
      status: operation.status,
      notes: operation.notes,
      executedById: userId,
      executedAt: new Date(),
    }).where(eq(runResults.id, result.id)).returning();
    await openTriageForResult(result.id, tx);
    body = { result: updated };
  }
  const sourceRefs = [...(operation.sourceRefs ?? [])];
  let event: Effect["event"];
  if (operation.evidence) {
    const { filename, dataBase64, contentType } = operation.evidence;
    const bytes = Buffer.from(dataBase64, "base64");
    if (bytes.length === 0 || bytes.length > agentEvidenceMaxBytes) {
      throw new AgentOperationError(400, "INVALID_EVIDENCE", "Evidence must contain between 1 byte and 1 MiB");
    }
    const file = new File([new Uint8Array(bytes)], filename, { type: contentType });
    // Retrying a rolled-back operation writes identical bytes at the same key.
    const storageId = createHash("sha256").update(operationIdentity).digest("hex");
    const stored = await storeAttachmentFile(file, storageId).catch(() => {
      throw new AgentOperationError(503, "EVIDENCE_STORAGE_FAILED", "Evidence storage is unavailable. Retry with the same key.");
    });
    const [attachment] = await tx.insert(attachments).values({
      ...stored,
      resultId: result.id,
      kind: inferAttachmentKind(stored.filename, stored.contentType),
      uploadedById: userId,
    }).returning({
      id: attachments.id,
      filename: attachments.filename,
      kind: attachments.kind,
      sizeBytes: attachments.sizeBytes,
      contentType: attachments.contentType,
    });
    const url = `/api/attachments/${attachment.id}`;
    body.attachment = { ...attachment, url };
    sourceRefs.push(url);
    event = {
      workspaceId, topic: "run", entityId: run.id, resultId: result.id,
      kind: "attachment", attachment: { ...attachment, url },
    };
  }
  return {
    status: 200,
    body: { ...body, href: `/runs/${run.id}` },
    targetType: operation.stepResultId ? "run_step_result" : "run_result",
    targetId: operation.stepResultId ?? result.id,
    sourceRefs,
    event,
  };
}

/** Normalize object key order without changing arrays or dropping JSON fields. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value).filter(([, item]) => item !== undefined);
    return `{${entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function runAgentOperation(actor: AgentActor, key: string | null, input: unknown) {
  const parsed = operationSchema.safeParse(input);
  if (!parsed.success) {
    throw new AgentOperationError(400, "INVALID_OPERATION", "Provide a supported operation with valid fields");
  }
  const operation = parsed.data;
  const { tokenId, userId, workspaceId } = actor;
  if (!tokenId || !userId || !actor.scopes.includes(capability[operation.action])) {
    throw new AgentOperationError(403, "CAPABILITY_REQUIRED", `Token scope insufficient. Required ${capability[operation.action]}`);
  }
  if (!key || !/^[a-zA-Z0-9._:-]{1,128}$/.test(key)) {
    throw new AgentOperationError(400, "IDEMPOTENCY_KEY_REQUIRED", "Provide an Idempotency-Key of up to 128 letters, digits, or . _ : -");
  }
  const requestHash = createHash("sha256").update(canonicalJson(operation)).digest("hex");

  const outcome = await db.transaction(async (tx) => {
    // Serialize retries by credential and key, including before a receipt exists.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`${tokenId}:${key}`}, 0))`);
    const [active] = await tx.select({ id: apiTokens.id }).from(apiTokens)
      .innerJoin(workspaces, eq(workspaces.id, apiTokens.workspaceId))
      .innerJoin(workspaceMembers, and(
        eq(workspaceMembers.workspaceId, workspaceId),
        eq(workspaceMembers.userId, userId),
      )).where(and(
        eq(apiTokens.id, tokenId),
        eq(apiTokens.workspaceId, workspaceId),
        eq(apiTokens.userId, userId),
        sql`${workspaces.archivedAt} is null and ${apiTokens.revokedAt} is null
          and (${apiTokens.expiresAt} is null or ${apiTokens.expiresAt} > now())`,
      )).for("share");
    if (!active) throw new AgentOperationError(403, "ACTOR_INACTIVE", "Agent credential or owner is no longer active");

    const prior = await tx.query.agentOperations.findFirst({ where: and(
      eq(agentOperations.tokenId, tokenId),
      eq(agentOperations.key, key),
    ) });
    if (prior) {
      if (prior.requestHash !== requestHash) {
        throw new AgentOperationError(409, "KEY_REUSED", "Idempotency key already identifies a different request");
      }
      return { status: prior.status, body: prior.response };
    }
    const result = await applyOperation(tx, workspaceId, userId, operation, `${tokenId}:${key}:${requestHash}`);
    await tx.insert(agentOperations).values({
      tokenId, key, requestHash, status: result.status, response: result.body,
    });
    await tx.insert(auditEvents).values({
      workspaceId,
      actorId: userId,
      action: `agent.${operation.action}`,
      targetType: result.targetType,
      targetId: result.targetId,
      metadataJson: JSON.stringify({ tokenId, key, sourceRefs: result.sourceRefs ?? [], outcome: "applied" }),
    });
    return result;
  });

  if ("proposal" in outcome && outcome.proposal && operation.action === "propose_coverage") {
    const proposal = toProposalListItem(outcome.proposal);
    notifyProposalCreated(outcome.proposal, proposal.diffs.length);
  }
  if ("event" in outcome && outcome.event) emitLive(outcome.event);
  if (operation.action === "request_workflow" && typeof outcome.body.requestId === "string") {
    await dispatchQueuedGithubRun(outcome.body.requestId, workspaceId);
  }
  return { status: outcome.status, body: outcome.body };
}
