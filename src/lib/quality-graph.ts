import { and, asc, desc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import {
  computeCoverage,
  computeFreshness,
  computeFreshnessDetail,
  computeImpact,
  type CoverageGap,
  type CoverageReport,
  type FreshnessState,
  type ImpactPathRule,
  type ImpactReport,
} from "@topology/domain";
import { db } from "@/db";
import {
  attachments,
  cases,
  components,
  failureSignatures,
  journeys,
  pathComponentRules,
  qualityEdges,
  requirements,
  risks,
  runResults,
  runs,
  testImplementations,
  testIntents,
  triageItems,
  type Case,
} from "@/db/schema";
import {
  mapDbPathRules,
  mapPathRulesByComponentKey,
} from "@/lib/impact-path-rules";

export { mapPathRulesByComponentKey } from "@/lib/impact-path-rules";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Subset of db/tx used by ensureIntentForCase (works with drizzle transactions). */
export type QualityGraphDb = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  query: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update: any;
};

export function implementationTypeForCase(row: {
  key: string;
  tags: string[] | null;
}): "manual" | "junit" {
  const tags = row.tags ?? [];
  if (
    row.key.startsWith("AUTO-") ||
    tags.includes("junit") ||
    tags.includes("automation")
  ) {
    return "junit";
  }
  return "manual";
}

/**
 * Ensure a case has a linked Test Intent + matching implementation.
 * Safe to call repeatedly (idempotent upsert by workspace+key).
 */
export async function ensureIntentForCase(
  row: Pick<
    Case,
    | "id"
    | "workspaceId"
    | "key"
    | "title"
    | "description"
    | "priority"
    | "status"
    | "folderId"
    | "assigneeId"
    | "intentId"
    | "tags"
  >,
  executor: QualityGraphDb = db,
  options?: { externalKey?: string | null; framework?: string | null },
): Promise<{ intentId: string; implementationId: string }> {
  if (row.intentId) {
    const existingImpl = await executor.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.caseId, row.id),
        eq(testImplementations.intentId, row.intentId),
      ),
    });
    if (existingImpl) {
      return { intentId: row.intentId, implementationId: existingImpl.id };
    }
    const type = implementationTypeForCase(row);
    const [created] = await executor
      .insert(testImplementations)
      .values({
        workspaceId: row.workspaceId,
        intentId: row.intentId,
        type,
        caseId: row.id,
        externalKey: options?.externalKey ?? (type === "junit" ? row.key : null),
        framework: options?.framework ?? (type === "junit" ? "junit" : null),
      })
      .returning({ id: testImplementations.id });
    return { intentId: row.intentId, implementationId: created.id };
  }

  let intent = await executor.query.testIntents.findFirst({
    where: and(
      eq(testIntents.workspaceId, row.workspaceId),
      eq(testIntents.key, row.key),
    ),
  });

  if (!intent) {
    try {
      const [created] = await executor
        .insert(testIntents)
        .values({
          workspaceId: row.workspaceId,
          key: row.key,
          title: row.title,
          behavior: row.description?.trim() ? row.description : row.title,
          criticality: row.priority,
          status: row.status,
          folderId: row.folderId,
          assigneeId: row.assigneeId,
        })
        .returning();
      intent = created;
    } catch {
      intent = await executor.query.testIntents.findFirst({
        where: and(
          eq(testIntents.workspaceId, row.workspaceId),
          eq(testIntents.key, row.key),
        ),
      });
      if (!intent) throw new Error("Failed to create test intent");
    }
  }

  await executor
    .update(cases)
    .set({ intentId: intent.id, updatedAt: new Date() })
    .where(eq(cases.id, row.id));

  const type = implementationTypeForCase(row);
  const existingImpl = await executor.query.testImplementations.findFirst({
    where: and(
      eq(testImplementations.intentId, intent.id),
      eq(testImplementations.caseId, row.id),
    ),
  });
  if (existingImpl) {
    return { intentId: intent.id, implementationId: existingImpl.id };
  }

  const [impl] = await executor
    .insert(testImplementations)
    .values({
      workspaceId: row.workspaceId,
      intentId: intent.id,
      type,
      caseId: row.id,
      externalKey: options?.externalKey ?? (type === "junit" ? row.key : null),
      framework: options?.framework ?? (type === "junit" ? "junit" : null),
    })
    .returning({ id: testImplementations.id });

  return { intentId: intent.id, implementationId: impl.id };
}

/** Narrow coverage gaps by kind, key, or title substring (case-insensitive). */
export function filterCoverageReport<
  T extends CoverageReport & { freshnessSummary?: unknown },
>(report: T, filter?: string | null): T {
  const q = filter?.trim().toLowerCase();
  if (!q) return report;
  const gaps = report.gaps.filter(
    (g: CoverageGap) =>
      g.kind.toLowerCase().includes(q) ||
      g.key.toLowerCase().includes(q) ||
      g.title.toLowerCase().includes(q),
  );
  return { ...report, gaps };
}

/** Load graph inputs and compute coverage for a workspace. */
export async function getWorkspaceCoverage(
  workspaceId: string,
): Promise<CoverageReport & { freshnessSummary: { fresh: number; unverified: number } }> {
  const [intentRows, implRows, reqRows, riskRows, edgeRows, lastExecRows] =
    await Promise.all([
      db.query.testIntents.findMany({
        where: eq(testIntents.workspaceId, workspaceId),
      }),
      db.query.testImplementations.findMany({
        where: eq(testImplementations.workspaceId, workspaceId),
      }),
      db.query.requirements.findMany({
        where: eq(requirements.workspaceId, workspaceId),
      }),
      db.query.risks.findMany({
        where: eq(risks.workspaceId, workspaceId),
      }),
      db.query.qualityEdges.findMany({
        where: eq(qualityEdges.workspaceId, workspaceId),
      }),
      db
        .select({
          intentId: cases.intentId,
          lastExecutedAt: sql<Date | null>`max(${runResults.executedAt})`,
        })
        .from(runResults)
        .innerJoin(cases, eq(runResults.caseId, cases.id))
        .innerJoin(runs, eq(runResults.runId, runs.id))
        .where(
          and(
            eq(runs.workspaceId, workspaceId),
            isNotNull(cases.intentId),
            ne(runResults.status, "untested"),
            isNotNull(runResults.executedAt),
          ),
        )
        .groupBy(cases.intentId),
    ]);

  const lastByIntent = new Map(
    lastExecRows
      .filter((r) => r.intentId)
      .map((r) => [r.intentId!, r.lastExecutedAt]),
  );

  const implsByIntent = new Map<string, { type: string }[]>();
  for (const impl of implRows) {
    const list = implsByIntent.get(impl.intentId) ?? [];
    list.push({ type: impl.type });
    implsByIntent.set(impl.intentId, list);
  }

  const intents = intentRows.map((intent) => ({
    id: intent.id,
    key: intent.key,
    title: intent.title,
    criticality: intent.criticality,
    implementations: implsByIntent.get(intent.id) ?? [],
    lastExecutedAt: lastByIntent.get(intent.id) ?? null,
  }));

  const report = computeCoverage({
    requirements: reqRows.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
    })),
    risks: riskRows.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
      criticality: r.criticality,
    })),
    intents,
    edges: edgeRows.map((e) => ({
      fromType: e.fromType,
      fromId: e.fromId,
      toType: e.toType,
      toId: e.toId,
      relation: e.relation,
    })),
  });

  let fresh = 0;
  let unverified = 0;
  for (const intent of intents) {
    if (computeFreshness(intent.lastExecutedAt) === "fresh") fresh += 1;
    else unverified += 1;
  }

  return { ...report, freshnessSummary: { fresh, unverified } };
}

/** Journey is covered when linked to ≥1 intent via `covers` or `part_of`. */
export function computeJourneyCoverageDimension(
  journeyIds: string[],
  edges: Array<{
    fromType: string;
    fromId: string;
    toType: string;
    toId: string;
    relation: string;
  }>,
  intentIdSet: Set<string>,
): { covered: number; total: number; pct: number | null } {
  const total = journeyIds.length;
  if (total === 0) {
    return { covered: 0, total: 0, pct: null };
  }

  let covered = 0;
  for (const journeyId of journeyIds) {
    const linked = edges.some((e) => {
      if (e.relation !== "covers" && e.relation !== "part_of") return false;
      if (
        e.fromType === "journey" &&
        e.fromId === journeyId &&
        e.toType === "intent"
      ) {
        return intentIdSet.has(e.toId);
      }
      if (
        e.toType === "journey" &&
        e.toId === journeyId &&
        e.fromType === "intent"
      ) {
        return intentIdSet.has(e.fromId);
      }
      return false;
    });
    if (linked) covered += 1;
  }

  return {
    covered,
    total,
    pct: Math.round((covered / total) * 100),
  };
}

/** Load journeys + edges and compute journey coverage for Hub. */
export async function getJourneyCoverage(workspaceId: string): Promise<{
  journey: { covered: number; total: number; pct: number | null };
  journeys: Array<{
    id: string;
    key: string;
    title: string;
    criticality: string;
    intentIds: string[];
  }>;
}> {
  const [journeyRows, edgeRows, intentRows] = await Promise.all([
    db.query.journeys.findMany({
      where: eq(journeys.workspaceId, workspaceId),
      orderBy: [asc(journeys.key)],
    }),
    db.query.qualityEdges.findMany({
      where: eq(qualityEdges.workspaceId, workspaceId),
    }),
    db.query.testIntents.findMany({
      where: eq(testIntents.workspaceId, workspaceId),
      columns: { id: true },
    }),
  ]);

  const intentIdSet = new Set(intentRows.map((i) => i.id));
  const edges = edgeRows.map((e) => ({
    fromType: e.fromType,
    fromId: e.fromId,
    toType: e.toType,
    toId: e.toId,
    relation: e.relation,
  }));

  const journeysWithIntents = journeyRows.map((j) => {
    const intentIds: string[] = [];
    for (const e of edges) {
      if (e.relation !== "covers" && e.relation !== "part_of") continue;
      if (
        e.fromType === "journey" &&
        e.fromId === j.id &&
        e.toType === "intent" &&
        intentIdSet.has(e.toId)
      ) {
        intentIds.push(e.toId);
      } else if (
        e.toType === "journey" &&
        e.toId === j.id &&
        e.fromType === "intent" &&
        intentIdSet.has(e.fromId)
      ) {
        intentIds.push(e.fromId);
      }
    }
    return {
      id: j.id,
      key: j.key,
      title: j.title,
      criticality: j.criticality,
      intentIds: [...new Set(intentIds)],
    };
  });

  return {
    journey: computeJourneyCoverageDimension(
      journeyRows.map((j) => j.id),
      edges,
      intentIdSet,
    ),
    journeys: journeysWithIntents,
  };
}

/**
 * Latest updatedAt among components/requirements linked to an intent via
 * quality_edges (for Phase 3 freshness relatedUpdatedAt).
 */
async function relatedUpdatedAtForIntent(
  workspaceId: string,
  intentId: string,
): Promise<Date | null> {
  const edges = await db.query.qualityEdges.findMany({
    where: and(
      eq(qualityEdges.workspaceId, workspaceId),
      or(
        and(
          eq(qualityEdges.fromType, "intent"),
          eq(qualityEdges.fromId, intentId),
        ),
        and(eq(qualityEdges.toType, "intent"), eq(qualityEdges.toId, intentId)),
      ),
    ),
  });

  const componentIds: string[] = [];
  const requirementIds: string[] = [];
  for (const e of edges) {
    const otherType = e.fromType === "intent" ? e.toType : e.fromType;
    const otherId = e.fromType === "intent" ? e.toId : e.fromId;
    if (otherType === "component") componentIds.push(otherId);
    if (otherType === "requirement") requirementIds.push(otherId);
  }

  let latest: Date | null = null;
  const consider = (d: Date | null | undefined) => {
    if (!d) return;
    if (!latest || d.getTime() > latest.getTime()) latest = d;
  };

  if (componentIds.length > 0) {
    const rows = await db.query.components.findMany({
      where: and(
        eq(components.workspaceId, workspaceId),
        inArray(components.id, componentIds),
      ),
    });
    for (const r of rows) consider(r.updatedAt);
  }
  if (requirementIds.length > 0) {
    const rows = await db.query.requirements.findMany({
      where: and(
        eq(requirements.workspaceId, workspaceId),
        inArray(requirements.id, requirementIds),
      ),
    });
    for (const r of rows) consider(r.updatedAt);
  }

  return latest;
}

function freshnessFields(input: {
  lastExecutedAt: Date | string | null;
  entityUpdatedAt?: Date | string | null;
  relatedUpdatedAt?: Date | string | null;
}): {
  freshness: FreshnessState;
  freshnessReason: string | null;
} {
  const detail = computeFreshnessDetail({
    lastExecutedAt: input.lastExecutedAt,
    entityUpdatedAt: input.entityUpdatedAt,
    relatedUpdatedAt: input.relatedUpdatedAt,
  });
  return { freshness: detail.state, freshnessReason: detail.reason };
}

export async function listIntentsWithMeta(workspaceId: string) {
  const [intentRows, implRows, lastExecRows, edgeRows] = await Promise.all([
    db.query.testIntents.findMany({
      where: eq(testIntents.workspaceId, workspaceId),
      orderBy: [asc(testIntents.key)],
      with: { folder: true, assignee: true },
    }),
    db.query.testImplementations.findMany({
      where: eq(testImplementations.workspaceId, workspaceId),
    }),
    db
      .select({
        intentId: cases.intentId,
        lastExecutedAt: sql<Date | null>`max(${runResults.executedAt})`,
      })
      .from(runResults)
      .innerJoin(cases, eq(runResults.caseId, cases.id))
      .innerJoin(runs, eq(runResults.runId, runs.id))
      .where(
        and(
          eq(runs.workspaceId, workspaceId),
          isNotNull(cases.intentId),
          ne(runResults.status, "untested"),
          isNotNull(runResults.executedAt),
        ),
      )
      .groupBy(cases.intentId),
    db.query.qualityEdges.findMany({
      where: eq(qualityEdges.workspaceId, workspaceId),
    }),
  ]);

  const lastByIntent = new Map(
    lastExecRows
      .filter((r) => r.intentId)
      .map((r) => [r.intentId!, r.lastExecutedAt]),
  );
  const implsByIntent = new Map<string, typeof implRows>();
  for (const impl of implRows) {
    const list = implsByIntent.get(impl.intentId) ?? [];
    list.push(impl);
    implsByIntent.set(impl.intentId, list);
  }

  // Batch related mtimes: component/requirement ids per intent
  const relatedIdsByIntent = new Map<
    string,
    { componentIds: string[]; requirementIds: string[] }
  >();
  for (const e of edgeRows) {
    let intentId: string | null = null;
    let otherType: string | null = null;
    let otherId: string | null = null;
    if (e.fromType === "intent") {
      intentId = e.fromId;
      otherType = e.toType;
      otherId = e.toId;
    } else if (e.toType === "intent") {
      intentId = e.toId;
      otherType = e.fromType;
      otherId = e.fromId;
    }
    if (!intentId || !otherType || !otherId) continue;
    const bucket = relatedIdsByIntent.get(intentId) ?? {
      componentIds: [],
      requirementIds: [],
    };
    if (otherType === "component") bucket.componentIds.push(otherId);
    if (otherType === "requirement") bucket.requirementIds.push(otherId);
    relatedIdsByIntent.set(intentId, bucket);
  }

  const allComponentIds = [
    ...new Set(
      [...relatedIdsByIntent.values()].flatMap((b) => b.componentIds),
    ),
  ];
  const allRequirementIds = [
    ...new Set(
      [...relatedIdsByIntent.values()].flatMap((b) => b.requirementIds),
    ),
  ];

  const [componentRows, requirementRows] = await Promise.all([
    allComponentIds.length > 0
      ? db.query.components.findMany({
          where: and(
            eq(components.workspaceId, workspaceId),
            inArray(components.id, allComponentIds),
          ),
        })
      : Promise.resolve([]),
    allRequirementIds.length > 0
      ? db.query.requirements.findMany({
          where: and(
            eq(requirements.workspaceId, workspaceId),
            inArray(requirements.id, allRequirementIds),
          ),
        })
      : Promise.resolve([]),
  ]);

  const componentUpdated = new Map(
    componentRows.map((c) => [c.id, c.updatedAt]),
  );
  const requirementUpdated = new Map(
    requirementRows.map((r) => [r.id, r.updatedAt]),
  );

  function relatedUpdatedAt(intentId: string): Date | null {
    const bucket = relatedIdsByIntent.get(intentId);
    if (!bucket) return null;
    let latest: Date | null = null;
    for (const id of bucket.componentIds) {
      const d = componentUpdated.get(id);
      if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
    }
    for (const id of bucket.requirementIds) {
      const d = requirementUpdated.get(id);
      if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
    }
    return latest;
  }

  return intentRows.map((intent) => {
    const lastExecutedAt = lastByIntent.get(intent.id) ?? null;
    const { freshness, freshnessReason } = freshnessFields({
      lastExecutedAt,
      entityUpdatedAt: intent.updatedAt,
      relatedUpdatedAt: relatedUpdatedAt(intent.id),
    });
    return {
      ...intent,
      implementations: implsByIntent.get(intent.id) ?? [],
      lastExecutedAt,
      freshness,
      freshnessReason,
    };
  });
}

export async function getIntentDetail(workspaceId: string, idOrKey: string) {
  const intent = UUID_RE.test(idOrKey)
    ? await db.query.testIntents.findFirst({
        where: and(
          eq(testIntents.workspaceId, workspaceId),
          eq(testIntents.id, idOrKey),
        ),
        with: {
          folder: true,
          assignee: true,
          implementations: { with: { case: true } },
          cases: true,
        },
      })
    : await db.query.testIntents.findFirst({
        where: and(
          eq(testIntents.workspaceId, workspaceId),
          eq(testIntents.key, idOrKey),
        ),
        with: {
          folder: true,
          assignee: true,
          implementations: { with: { case: true } },
          cases: true,
        },
      });
  if (!intent) return null;

  const edges = await db.query.qualityEdges.findMany({
    where: and(
      eq(qualityEdges.workspaceId, workspaceId),
      or(
        and(
          eq(qualityEdges.fromType, "intent"),
          eq(qualityEdges.fromId, intent.id),
        ),
        and(
          eq(qualityEdges.toType, "intent"),
          eq(qualityEdges.toId, intent.id),
        ),
      ),
    ),
  });

  const caseIds = intent.cases.map((c) => c.id);
  let lastExecutedAt: Date | null = null;
  if (caseIds.length > 0) {
    const [row] = await db
      .select({
        lastExecutedAt: sql<Date | null>`max(${runResults.executedAt})`,
      })
      .from(runResults)
      .where(
        and(
          inArray(runResults.caseId, caseIds),
          ne(runResults.status, "untested"),
          isNotNull(runResults.executedAt),
        ),
      );
    lastExecutedAt = row?.lastExecutedAt ?? null;
  }

  const relatedUpdatedAt = await relatedUpdatedAtForIntent(
    workspaceId,
    intent.id,
  );
  const { freshness, freshnessReason } = freshnessFields({
    lastExecutedAt,
    entityUpdatedAt: intent.updatedAt,
    relatedUpdatedAt,
  });

  return {
    ...intent,
    edges,
    lastExecutedAt,
    freshness,
    freshnessReason,
  };
}

export async function getRequirementDetail(workspaceId: string, idOrKey: string) {
  const requirement = UUID_RE.test(idOrKey)
    ? await db.query.requirements.findFirst({
        where: and(
          eq(requirements.workspaceId, workspaceId),
          eq(requirements.id, idOrKey),
        ),
      })
    : await db.query.requirements.findFirst({
        where: and(
          eq(requirements.workspaceId, workspaceId),
          eq(requirements.key, idOrKey),
        ),
      });
  if (!requirement) return null;

  const edges = await db.query.qualityEdges.findMany({
    where: and(
      eq(qualityEdges.workspaceId, workspaceId),
      or(
        and(
          eq(qualityEdges.fromType, "requirement"),
          eq(qualityEdges.fromId, requirement.id),
        ),
        and(
          eq(qualityEdges.toType, "requirement"),
          eq(qualityEdges.toId, requirement.id),
        ),
      ),
    ),
  });

  const coversIntentIds = edges
    .filter(
      (e) =>
        e.fromType === "requirement" &&
        e.fromId === requirement.id &&
        e.toType === "intent" &&
        e.relation === "covers",
    )
    .map((e) => e.toId);

  return { ...requirement, edges, coversIntentIds };
}

export type ExecutionHistoryEntry = {
  id: string;
  runId: string;
  runName: string | null;
  caseId: string | null;
  caseKey: string | null;
  implementationId: string | null;
  externalKey: string | null;
  status: string;
  notes: string;
  errorMessage: string | null;
  executedAt: Date | null;
  durationMs: number | null;
};

export async function getExecutionHistory(
  workspaceId: string,
  opts: {
    intentId?: string;
    intentKey?: string;
    implementationId?: string;
    limit?: number;
  },
): Promise<{ results: ExecutionHistoryEntry[] }> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let implementationIds: string[] = [];
  let caseIds: string[] = [];

  if (opts.implementationId) {
    const impl = await db.query.testImplementations.findFirst({
      where: and(
        eq(testImplementations.id, opts.implementationId),
        eq(testImplementations.workspaceId, workspaceId),
      ),
    });
    if (!impl) {
      return { results: [] };
    }
    implementationIds = [impl.id];
    if (impl.caseId) caseIds = [impl.caseId];
  } else {
    const intentRef = opts.intentId ?? opts.intentKey;
    if (!intentRef) {
      return { results: [] };
    }
    const intent = await getIntentDetail(workspaceId, intentRef);
    if (!intent) {
      return { results: [] };
    }
    implementationIds = intent.implementations.map((i) => i.id);
    caseIds = intent.cases.map((c) => c.id);
    if (implementationIds.length === 0 && caseIds.length === 0) {
      return { results: [] };
    }
  }

  const predicates = [];
  if (implementationIds.length > 0) {
    predicates.push(inArray(runResults.implementationId, implementationIds));
  }
  if (caseIds.length > 0) {
    predicates.push(inArray(runResults.caseId, caseIds));
  }
  const scopeFilter =
    predicates.length === 1 ? predicates[0]! : or(...predicates);

  const rows = await db.query.runResults.findMany({
    where: and(
      scopeFilter,
      ne(runResults.status, "untested"),
      isNotNull(runResults.executedAt),
    ),
    with: {
      run: true,
      case: true,
      implementation: true,
    },
    orderBy: [desc(runResults.executedAt)],
    limit: limit * 3,
  });

  const scoped = rows
    .filter((r) => r.run?.workspaceId === workspaceId)
    .slice(0, limit)
    .map((r) => ({
      id: r.id,
      runId: r.runId,
      runName: r.run?.name ?? null,
      caseId: r.caseId,
      caseKey: r.case?.key ?? null,
      implementationId: r.implementationId,
      externalKey: r.externalKey ?? r.implementation?.externalKey ?? null,
      status: r.status,
      notes: r.notes,
      errorMessage: r.errorMessage,
      executedAt: r.executedAt,
      durationMs: r.durationMs,
    }));

  return { results: scoped };
}

function attachmentSummary(rows: typeof attachments.$inferSelect[]) {
  return rows.map((a) => ({
    id: a.id,
    kind: a.kind,
    filename: a.filename,
    contentType: a.contentType,
    sizeBytes: a.sizeBytes,
  }));
}

function signaturePayload(sig: typeof failureSignatures.$inferSelect | null) {
  if (!sig) return null;
  return {
    id: sig.id,
    hash: sig.hash,
    normalizedMessage: sig.normalizedMessage,
    stackTop: sig.stackTop,
    occurrenceCount: sig.occurrenceCount,
    lastSeenAt: sig.lastSeenAt,
  };
}

export async function getFailureEvidence(
  workspaceId: string,
  opts: { resultId?: string; signatureId?: string },
) {
  if (opts.resultId) {
    const result = await db.query.runResults.findFirst({
      where: eq(runResults.id, opts.resultId),
      with: {
        run: true,
        attachments: true,
      },
    });
    if (!result?.run || result.run.workspaceId !== workspaceId) {
      return null;
    }

    const triage = await db.query.triageItems.findFirst({
      where: eq(triageItems.resultId, result.id),
    });
    let signature: typeof failureSignatures.$inferSelect | null = null;
    if (triage?.signatureId) {
      signature =
        (await db.query.failureSignatures.findFirst({
          where: and(
            eq(failureSignatures.id, triage.signatureId),
            eq(failureSignatures.workspaceId, workspaceId),
          ),
        })) ?? null;
    }

    return {
      resultId: result.id,
      notes: result.notes,
      errorMessage: result.errorMessage,
      stack: result.stack,
      attachments: attachmentSummary(result.attachments),
      signature: signaturePayload(signature),
    };
  }

  if (opts.signatureId) {
    const signature = await db.query.failureSignatures.findFirst({
      where: and(
        eq(failureSignatures.id, opts.signatureId),
        eq(failureSignatures.workspaceId, workspaceId),
      ),
    });
    if (!signature) return null;

    const triage = await db.query.triageItems.findFirst({
      where: and(
        eq(triageItems.workspaceId, workspaceId),
        eq(triageItems.signatureId, signature.id),
      ),
      orderBy: [desc(triageItems.lastSeenAt)],
    });

    let result = triage?.resultId
      ? await db.query.runResults.findFirst({
          where: eq(runResults.id, triage.resultId),
          with: { attachments: true, run: true },
        })
      : null;

    if (result?.run && result.run.workspaceId !== workspaceId) {
      result = null;
    }

    return {
      resultId: result?.id ?? null,
      notes: result?.notes ?? triage?.notes ?? "",
      errorMessage: result?.errorMessage ?? null,
      stack: result?.stack ?? null,
      attachments: attachmentSummary(result?.attachments ?? []),
      signature: signaturePayload(signature),
    };
  }

  return null;
}

/**
 * Re-point an implementation (typically AUTO-* / junit) onto an existing intent.
 * Also updates the linked case.intentId when present.
 * Leaves the previous intent row in place (may become empty of implementations).
 */
export class LinkImplementationError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "LinkImplementationError";
    this.status = status;
  }
}

export async function linkImplementationToIntent(
  workspaceId: string,
  implementationId: string,
  targetIntentId: string,
  executor: QualityGraphDb = db,
): Promise<{
  implementationId: string;
  intentId: string;
  previousIntentId: string;
  caseId: string | null;
}> {
  const impl = await executor.query.testImplementations.findFirst({
    where: and(
      eq(testImplementations.id, implementationId),
      eq(testImplementations.workspaceId, workspaceId),
    ),
  });
  if (!impl) {
    throw new LinkImplementationError(404, "Implementation not found");
  }

  const target = await executor.query.testIntents.findFirst({
    where: and(
      eq(testIntents.id, targetIntentId),
      eq(testIntents.workspaceId, workspaceId),
    ),
  });
  if (!target) {
    throw new LinkImplementationError(404, "Intent not found");
  }

  if (impl.intentId === target.id) {
    return {
      implementationId: impl.id,
      intentId: target.id,
      previousIntentId: impl.intentId,
      caseId: impl.caseId ?? null,
    };
  }

  const previousIntentId = impl.intentId as string;

  await executor
    .update(testImplementations)
    .set({ intentId: target.id, updatedAt: new Date() })
    .where(eq(testImplementations.id, impl.id));

  if (impl.caseId) {
    await executor
      .update(cases)
      .set({ intentId: target.id, updatedAt: new Date() })
      .where(eq(cases.id, impl.caseId));
  }

  return {
    implementationId: impl.id,
    intentId: target.id,
    previousIntentId,
    caseId: impl.caseId ?? null,
  };
}

/**
 * Load workspace graph entities and walk change impact for the given paths.
 * When `rules` is omitted, path_component_rules are loaded from the DB.
 */
export async function getWorkspaceImpact(
  workspaceId: string,
  changedPaths: string[],
  rules?: { pattern: string; componentKey: string }[],
): Promise<{
  impact: ImpactReport;
  pathRulesApplied: number;
  unknownComponentKeys: string[];
  rulesSource: "request" | "database";
}> {
  const [componentRows, reqRows, intentRows, implRows, edgeRows, dbRuleRows] =
    await Promise.all([
      db.query.components.findMany({
        where: eq(components.workspaceId, workspaceId),
      }),
      db.query.requirements.findMany({
        where: eq(requirements.workspaceId, workspaceId),
      }),
      db.query.testIntents.findMany({
        where: eq(testIntents.workspaceId, workspaceId),
      }),
      db.query.testImplementations.findMany({
        where: eq(testImplementations.workspaceId, workspaceId),
      }),
      db.query.qualityEdges.findMany({
        where: eq(qualityEdges.workspaceId, workspaceId),
      }),
      rules === undefined
        ? db.query.pathComponentRules.findMany({
            where: eq(pathComponentRules.workspaceId, workspaceId),
          })
        : Promise.resolve([]),
    ]);

  let pathRules: ImpactPathRule[];
  let unknownKeys: string[] = [];
  let rulesSource: "request" | "database";

  if (rules === undefined) {
    pathRules = mapDbPathRules(dbRuleRows);
    rulesSource = "database";
  } else {
    const mapped = mapPathRulesByComponentKey(rules, componentRows);
    pathRules = mapped.pathRules;
    unknownKeys = mapped.unknownKeys;
    rulesSource = "request";
  }

  const impact = computeImpact({
    changedPaths,
    pathRules,
    components: componentRows.map((c) => ({
      id: c.id,
      key: c.key,
      title: c.title,
    })),
    requirements: reqRows.map((r) => ({
      id: r.id,
      key: r.key,
      title: r.title,
    })),
    intents: intentRows.map((i) => ({
      id: i.id,
      key: i.key,
      title: i.title,
      criticality: i.criticality,
    })),
    implementations: implRows.map((i) => ({
      id: i.id,
      intentId: i.intentId,
      type: i.type,
      sourcePath: i.sourcePath,
    })),
    edges: edgeRows.map((e) => ({
      fromType: e.fromType,
      fromId: e.fromId,
      toType: e.toType,
      toId: e.toId,
      relation: e.relation,
    })),
  });

  return {
    impact,
    pathRulesApplied: pathRules.length,
    unknownComponentKeys: unknownKeys,
    rulesSource,
  };
}
