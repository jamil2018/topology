import { and, asc, eq, inArray, isNotNull, ne, or, sql } from "drizzle-orm";
import {
  computeFreshnessDetail,
  type FreshnessState,
} from "@topology/domain";
import { db } from "@/db";
import {
  cases,
  components,
  qualityEdges,
  requirements,
  runResults,
  runs,
  testImplementations,
  testIntents,
} from "@/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

