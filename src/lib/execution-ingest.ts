import { and, desc, eq } from "drizzle-orm";
import type {
  ExecutionEnvironment,
  ExecutionReport,
  ExecutionResult,
  ExecutionStatus,
} from "@topology/domain";
import { db } from "@/db";
import {
  environments,
  runs,
  runResults,
  testImplementations,
  testIntents,
  type Environment,
  type EnvironmentKind,
  type Run,
} from "@/db/schema";
import {
  CiIngestError,
  clampDurationMs,
  ciFailureResponse,
} from "@/lib/ci-ingest";
import { refreshImplementationStatsForRun } from "@/lib/implementation-stats";
import { immutableMessageFor, isRunFrozen } from "@/lib/run-immutability";

type IngestTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map protocol statuses onto existing result_status enum (no `error` yet). */
export function mapExecutionStatus(
  status: ExecutionStatus,
): "passed" | "failed" | "blocked" | "skipped" | "untested" {
  if (status === "error") return "failed";
  return status;
}

export function formatEnvironmentSuffix(
  env: ExecutionEnvironment | undefined,
): string | null {
  if (!env) return null;
  const parts = [env.browser, env.os].filter(
    (p): p is string => Boolean(p && p.trim()),
  );
  return parts.length ? parts.join("/") : null;
}

/** Persist browser/os on run_results.environmentJson. */
export function serializeEnvironmentJson(
  env: ExecutionEnvironment | undefined,
): string | null {
  if (!env) return null;
  const payload: Record<string, string> = {};
  if (env.browser?.trim()) payload.browser = env.browser.trim();
  if (env.os?.trim()) payload.os = env.os.trim();
  return Object.keys(payload).length > 0 ? JSON.stringify(payload) : null;
}

/** Infer environments.kind from a free-text label. */
export function inferEnvironmentKind(label: string): EnvironmentKind {
  const n = label.trim().toLowerCase();
  if (!n) return "ci";
  if (/\bprod/.test(n)) return "prod";
  if (/stag/.test(n)) return "staging";
  if (/\blocal\b/.test(n) || n === "dev" || n.startsWith("dev:")) return "local";
  return "ci";
}

/**
 * Stable environments.name for a report: kind, or kind:browser/os when present.
 */
export function environmentNameForReport(
  env: ExecutionEnvironment | undefined,
  kind: EnvironmentKind = "ci",
): string {
  const suffix = formatEnvironmentSuffix(env);
  return suffix ? `${kind}:${suffix}` : kind;
}

/** Display title; env suffix is optional when environmentJson is stored. */
export function buildExecutionTitle(
  result: ExecutionResult,
  runEnv?: ExecutionEnvironment,
): string {
  const base =
    result.title?.trim() ||
    result.externalKey?.trim() ||
    result.intentKey?.trim() ||
    "execution";
  const suffix = formatEnvironmentSuffix(result.environment ?? runEnv);
  if (!suffix || base.includes(suffix)) return base;
  return `${base} [${suffix}]`;
}

export function buildExecutionNotes(
  result: ExecutionResult,
  runEnv?: ExecutionEnvironment,
): string {
  const parts: string[] = [];
  if (result.errorMessage?.trim()) parts.push(result.errorMessage.trim());
  if (result.stack?.trim()) parts.push(result.stack.trim());

  const envSuffix = formatEnvironmentSuffix(result.environment ?? runEnv);
  if (envSuffix) parts.push(`env: ${envSuffix}`);

  if (result.artifacts.length > 0) {
    const labels = result.artifacts
      .map((a) => a.name || a.path || a.url || a.kind)
      .filter(Boolean);
    if (labels.length) parts.push(`artifacts: ${labels.join(", ")}`);
  }

  return parts.join("\n\n");
}

/**
 * Strip Topology-only envelope fields before parseExecutionReport (strict).
 */
export function extractTopologyRunId(body: unknown): {
  runId: string | undefined;
  reportPayload: unknown;
} {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { runId: undefined, reportPayload: body };
  }
  const record = body as Record<string, unknown>;
  const { runId, ...rest } = record;
  return {
    runId: typeof runId === "string" && runId.trim() ? runId.trim() : undefined,
    reportPayload: rest,
  };
}

type ResolvedIdentity = {
  caseId: string | null;
  implementationId: string | null;
};

async function resolveResultIdentity(
  tx: IngestTx,
  workspaceId: string,
  result: ExecutionResult,
): Promise<ResolvedIdentity> {
  if (result.implementationId) {
    if (!UUID_RE.test(result.implementationId)) {
      throw new CiIngestError(400, { error: "Invalid implementationId" });
    }
    const impl = await tx.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.id, result.implementationId),
        eq(testImplementations.workspaceId, workspaceId),
      ),
    });
    if (!impl) {
      throw new CiIngestError(404, { error: "Implementation not found" });
    }
    return { caseId: impl.caseId ?? null, implementationId: impl.id };
  }

  if (result.externalKey) {
    const byExternal = await tx.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.workspaceId, workspaceId),
        eq(testImplementations.externalKey, result.externalKey),
      ),
    });
    if (byExternal) {
      return {
        caseId: byExternal.caseId ?? null,
        implementationId: byExternal.id,
      };
    }
  }

  if (result.intentKey) {
    const intent = await tx.query.testIntents.findFirst({
      where: and(
        eq(testIntents.workspaceId, workspaceId),
        eq(testIntents.key, result.intentKey),
      ),
    });
    if (!intent) return { caseId: null, implementationId: null };

    const impls = await tx.query.testImplementations.findMany({
      where: and(
        eq(testImplementations.intentId, intent.id),
        eq(testImplementations.workspaceId, workspaceId),
      ),
    });

    if (result.externalKey) {
      const matched = impls.find((i) => i.externalKey === result.externalKey);
      if (matched) {
        return {
          caseId: matched.caseId ?? null,
          implementationId: matched.id,
        };
      }
    }

    const preferred = impls.find(
      (i) =>
        i.type === "junit" ||
        i.type === "playwright" ||
        i.type === "api" ||
        i.type === "unit" ||
        i.type === "agent",
    );
    if (preferred) {
      return {
        caseId: preferred.caseId ?? null,
        implementationId: preferred.id,
      };
    }

    const manual = impls.find((i) => i.type === "manual");
    if (manual) {
      return {
        caseId: manual.caseId ?? null,
        implementationId: manual.id,
      };
    }

    const any = impls[0];
    if (any) {
      return { caseId: any.caseId ?? null, implementationId: any.id };
    }
  }

  return { caseId: null, implementationId: null };
}

async function findOrCreateEnvironment(
  tx: IngestTx,
  input: {
    workspaceId: string;
    name: string;
    kind: EnvironmentKind;
    metadataJson: string | null;
  },
): Promise<Environment> {
  const existing = await tx.query.environments.findFirst({
    where: and(
      eq(environments.workspaceId, input.workspaceId),
      eq(environments.name, input.name),
    ),
  });
  if (existing) {
    if (
      input.metadataJson &&
      existing.metadataJson !== input.metadataJson
    ) {
      const [updated] = await tx
        .update(environments)
        .set({
          metadataJson: input.metadataJson,
          updatedAt: new Date(),
        })
        .where(eq(environments.id, existing.id))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  const [created] = await tx
    .insert(environments)
    .values({
      workspaceId: input.workspaceId,
      name: input.name,
      kind: input.kind,
      metadataJson: input.metadataJson,
    })
    .returning();

  if (!created) throw new CiIngestError(500, { error: "Ingest failed" });
  return created;
}

async function resolveAutomationRun(
  tx: IngestTx,
  input: {
    workspaceId: string;
    userId: string | null;
    runId?: string;
    externalId?: string;
    branch?: string;
    commitSha?: string;
    environmentLabel: string;
    environmentId: string | null;
  },
): Promise<Run> {
  if (input.runId) {
    if (!UUID_RE.test(input.runId)) {
      throw new CiIngestError(400, { error: "Invalid runId" });
    }
    const locked = await tx.query.runs.findFirst({
      where: and(
        eq(runs.id, input.runId),
        eq(runs.workspaceId, input.workspaceId),
      ),
    });
    if (!locked) throw new CiIngestError(404, { error: "Run not found" });
    if (isRunFrozen(locked.status)) {
      throw new CiIngestError(409, {
        error: immutableMessageFor(locked.status),
      });
    }
    if (input.environmentId && !locked.environmentId) {
      const [patched] = await tx
        .update(runs)
        .set({
          environmentId: input.environmentId,
          environment: input.environmentLabel,
          updatedAt: new Date(),
        })
        .where(eq(runs.id, locked.id))
        .returning();
      return patched ?? locked;
    }
    return locked;
  }

  if (input.externalId) {
    const existing = await tx.query.runs.findFirst({
      where: and(
        eq(runs.workspaceId, input.workspaceId),
        eq(runs.externalId, input.externalId),
        eq(runs.kind, "automation"),
      ),
      orderBy: [desc(runs.createdAt)],
    });
    if (existing && !isRunFrozen(existing.status)) {
      if (input.environmentId && !existing.environmentId) {
        const [patched] = await tx
          .update(runs)
          .set({
            environmentId: input.environmentId,
            environment: input.environmentLabel,
            updatedAt: new Date(),
          })
          .where(eq(runs.id, existing.id))
          .returning();
        return patched ?? existing;
      }
      return existing;
    }
  }

  const name = input.externalId
    ? `Execution ${input.externalId}`
    : `Execution upload ${new Date().toISOString()}`;

  const [created] = await tx
    .insert(runs)
    .values({
      workspaceId: input.workspaceId,
      name,
      kind: "automation",
      source: "execution-protocol",
      branch: input.branch,
      commitSha: input.commitSha,
      externalId: input.externalId,
      status: "in_progress",
      environment: input.environmentLabel,
      environmentId: input.environmentId,
      startedAt: new Date(),
      createdById: input.userId,
      shardTotal: 1,
      shardsReceived: 0,
    })
    .returning();

  if (!created) throw new CiIngestError(500, { error: "Ingest failed" });
  return created;
}

export async function submitExecutionReport(input: {
  workspaceId: string;
  userId: string | null;
  report: ExecutionReport;
  /** Topology run UUID from request envelope (not part of protocol schema). */
  runId?: string;
}): Promise<{ ok: true; runId: string; resultIds: string[] }> {
  const runEnv = input.report.run?.environment;
  const envLabel = formatEnvironmentSuffix(runEnv) ?? "ci";
  const envKind = inferEnvironmentKind(envLabel);
  const envName = environmentNameForReport(runEnv, envKind);
  const envMetadata = serializeEnvironmentJson(runEnv);

  const outcome = await db.transaction(async (tx) => {
    const environment = await findOrCreateEnvironment(tx, {
      workspaceId: input.workspaceId,
      name: envName,
      kind: envKind,
      metadataJson: envMetadata,
    });

    const run = await resolveAutomationRun(tx, {
      workspaceId: input.workspaceId,
      userId: input.userId,
      runId: input.runId,
      externalId: input.report.run?.externalId,
      branch: input.report.run?.branch,
      commitSha: input.report.run?.commitSha,
      environmentLabel: envLabel,
      environmentId: environment.id,
    });

    const resultIds: string[] = [];

    for (const result of input.report.results) {
      const identity = await resolveResultIdentity(
        tx,
        input.workspaceId,
        result,
      );
      const resultEnv = result.environment ?? runEnv;
      const [row] = await tx
        .insert(runResults)
        .values({
          runId: run.id,
          caseId: identity.caseId,
          implementationId: identity.implementationId,
          environmentJson: serializeEnvironmentJson(resultEnv),
          externalKey: result.externalKey ?? result.intentKey ?? null,
          classname: null,
          title: buildExecutionTitle(result, runEnv),
          status: mapExecutionStatus(result.status),
          notes: buildExecutionNotes(result, runEnv),
          errorMessage: result.errorMessage?.trim() || null,
          stack: result.stack?.trim() || null,
          durationMs: clampDurationMs(result.durationMs ?? 0),
          executedById: input.userId,
          executedAt: new Date(),
        })
        .returning({ id: runResults.id });

      if (!row) throw new CiIngestError(500, { error: "Ingest failed" });
      resultIds.push(row.id);
    }

    await tx
      .update(runs)
      .set({
        status: "completed",
        completedAt: new Date(),
        updatedAt: new Date(),
        shardsReceived: 1,
        environmentId: run.environmentId ?? environment.id,
        environment: envLabel,
        branch: input.report.run?.branch ?? run.branch,
        commitSha: input.report.run?.commitSha ?? run.commitSha,
        ...(input.report.run?.externalId
          ? { externalId: input.report.run.externalId }
          : {}),
      })
      .where(eq(runs.id, run.id));

    return { ok: true as const, runId: run.id, resultIds };
  });

  try {
    await refreshImplementationStatsForRun(outcome.runId);
  } catch {
    // Rollups are best-effort; the run is already completed.
  }

  return outcome;
}

export { CiIngestError, ciFailureResponse };
