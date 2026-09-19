import { and, desc, eq } from "drizzle-orm";
import {
  isProposalActorType,
  isProposalStatus,
  validateProposalPayload,
  type ProposalDiff,
  type ProposalPayload,
} from "@topology/domain";
import { db } from "@/db";
import {
  components,
  proposals,
  qualityEdges,
  requirements,
  risks,
  testImplementations,
  testIntents,
  type Proposal as ProposalRow,
} from "@/db/schema";
import {
  getAiProviderConfig,
  isAiProviderEnabled as isAiConfigEnabled,
} from "@/lib/ai-provider";

const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const CASE_STATUSES = new Set(["draft", "ready", "blocked", "deprecated"]);
const ENTITY_TYPES = new Set([
  "intent",
  "requirement",
  "risk",
  "component",
  "implementation",
  "journey",
]);
const RELATIONS = new Set([
  "covers",
  "mitigates",
  "belongs_to",
  "implements",
  "part_of",
]);
const IMPL_TYPES = new Set([
  "manual",
  "junit",
  "playwright",
  "api",
  "unit",
  "agent",
]);

export class ProposalApplyError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ProposalApplyError";
    this.status = status;
  }
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asPriority(value: unknown): "P0" | "P1" | "P2" | "P3" {
  if (typeof value === "string" && PRIORITIES.has(value)) {
    return value as "P0" | "P1" | "P2" | "P3";
  }
  return "P2";
}

function asCaseStatus(
  value: unknown,
): "draft" | "ready" | "blocked" | "deprecated" {
  if (typeof value === "string" && CASE_STATUSES.has(value)) {
    return value as "draft" | "ready" | "blocked" | "deprecated";
  }
  return "draft";
}

function serializeInputRefs(refs: string[] | undefined | null): string | null {
  if (!refs || refs.length === 0) return null;
  return JSON.stringify(refs);
}

export function parseInputRefs(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((v): v is string => typeof v === "string");
  } catch {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

export function parseProposalPayload(payloadJson: string): ProposalPayload {
  let raw: unknown;
  try {
    raw = JSON.parse(payloadJson);
  } catch {
    throw new ProposalApplyError("Invalid proposal payload JSON", 400);
  }
  const validated = validateProposalPayload(raw);
  if (!validated.ok) {
    throw new ProposalApplyError(
      validated.issues.map((i) => `${i.path}: ${i.message}`).join("; ") ||
        "Invalid proposal payload",
      400,
    );
  }
  return validated.payload;
}

export function getAiProvider(): string {
  return getAiProviderConfig().provider;
}

/** True when an in-app LLM provider is configured (proposals review still works with none). */
export function isAiProviderEnabled(): boolean {
  return isAiConfigEnabled(getAiProviderConfig());
}

export type ProposalApplyProvenance = {
  generatedBy: string;
  model: string | null;
  approvedById: string;
};

export function proposalApplyProvenance(
  row: Pick<ProposalRow, "actorType" | "model">,
  approvedById: string,
): ProposalApplyProvenance {
  return {
    generatedBy: row.actorType === "model" ? "model" : row.actorType,
    model: row.model,
    approvedById,
  };
}

export type ProposalListItem = {
  id: string;
  entityType: string;
  status: string;
  actorType: string;
  model: string | null;
  inputRefs: string[];
  rationale: string | null;
  diffs: ProposalDiff[];
  createdById: string | null;
  approvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function toProposalListItem(row: ProposalRow): ProposalListItem {
  let rationale: string | null = null;
  let diffs: ProposalDiff[] = [];
  try {
    const payload = parseProposalPayload(row.payloadJson);
    rationale = payload.rationale ?? null;
    diffs = payload.diffs;
  } catch {
    rationale = null;
    diffs = [];
  }
  return {
    id: row.id,
    entityType: row.entityType,
    status: row.status,
    actorType: row.actorType,
    model: row.model,
    inputRefs: parseInputRefs(row.inputRefs),
    rationale,
    diffs,
    createdById: row.createdById,
    approvedById: row.approvedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listProposals(
  workspaceId: string,
  opts?: { status?: string },
): Promise<ProposalListItem[]> {
  const rows = await db.query.proposals.findMany({
    where: opts?.status
      ? and(
          eq(proposals.workspaceId, workspaceId),
          eq(
            proposals.status,
            opts.status as "pending" | "accepted" | "rejected",
          ),
        )
      : eq(proposals.workspaceId, workspaceId),
    orderBy: [desc(proposals.createdAt)],
    limit: 200,
  });
  return rows.map(toProposalListItem);
}

export type CreateProposalInput = {
  workspaceId: string;
  payload: ProposalPayload;
  entityType?: string;
  actorType?: string;
  model?: string | null;
  inputRefs?: string[] | null;
  createdById?: string | null;
};

export async function createProposal(
  input: CreateProposalInput,
): Promise<ProposalRow> {
  const actorType = isProposalActorType(input.actorType)
    ? input.actorType
    : "agent";
  const entityType =
    input.entityType?.trim() ||
    input.payload.diffs[0]?.entityType ||
    "intent";

  const [row] = await db
    .insert(proposals)
    .values({
      workspaceId: input.workspaceId,
      entityType,
      payloadJson: JSON.stringify(input.payload),
      status: "pending",
      actorType,
      model: input.model ?? null,
      inputRefs: serializeInputRefs(input.inputRefs ?? null),
      createdById: input.createdById ?? null,
    })
    .returning();

  const { dispatchWebhook } = await import("@/lib/webhooks");
  void dispatchWebhook(
    "proposal.created",
    {
      proposalId: row.id,
      entityType: row.entityType,
      status: row.status,
      actorType: row.actorType,
      model: row.model,
      diffCount: input.payload.diffs.length,
    },
    input.workspaceId,
  ).catch(() => {});

  return row;
}

type ApplyResult = {
  applied: Array<{
    action: string;
    entityType: string;
    id: string;
    key?: string;
  }>;
  provenance?: ProposalApplyProvenance;
};

async function resolveEntityIdByKey(
  workspaceId: string,
  entityType: string,
  key: string,
): Promise<string | null> {
  if (entityType === "intent") {
    const row = await db.query.testIntents.findFirst({
      where: and(
        eq(testIntents.workspaceId, workspaceId),
        eq(testIntents.key, key),
      ),
    });
    return row?.id ?? null;
  }
  if (entityType === "requirement") {
    const row = await db.query.requirements.findFirst({
      where: and(
        eq(requirements.workspaceId, workspaceId),
        eq(requirements.key, key),
      ),
    });
    return row?.id ?? null;
  }
  if (entityType === "risk") {
    const row = await db.query.risks.findFirst({
      where: and(eq(risks.workspaceId, workspaceId), eq(risks.key, key)),
    });
    return row?.id ?? null;
  }
  if (entityType === "component") {
    const row = await db.query.components.findFirst({
      where: and(
        eq(components.workspaceId, workspaceId),
        eq(components.key, key),
      ),
    });
    return row?.id ?? null;
  }
  return null;
}

async function applyCreateDiff(
  workspaceId: string,
  diff: ProposalDiff,
  applied: ApplyResult["applied"],
  keyToId: Map<string, string>,
): Promise<void> {
  const after = diff.after ?? {};
  const key = asString(after.key);

  if (diff.entityType === "intent") {
    const title = asString(after.title);
    if (!key || !title) {
      throw new ProposalApplyError(
        "create intent requires after.key and after.title",
      );
    }
    const [created] = await db
      .insert(testIntents)
      .values({
        workspaceId,
        key,
        title,
        behavior: asString(after.behavior) ?? title,
        criticality: asPriority(after.criticality),
        status: asCaseStatus(after.status),
      })
      .returning();
    keyToId.set(`intent:${key}`, created.id);
    applied.push({
      action: "create",
      entityType: "intent",
      id: created.id,
      key,
    });
    return;
  }

  if (diff.entityType === "requirement") {
    const title = asString(after.title);
    if (!key || !title) {
      throw new ProposalApplyError(
        "create requirement requires after.key and after.title",
      );
    }
    const [created] = await db
      .insert(requirements)
      .values({
        workspaceId,
        key,
        title,
        description: asString(after.description) ?? "",
        criticality: asPriority(after.criticality),
      })
      .returning();
    keyToId.set(`requirement:${key}`, created.id);
    applied.push({
      action: "create",
      entityType: "requirement",
      id: created.id,
      key,
    });
    return;
  }

  if (diff.entityType === "risk") {
    const title = asString(after.title);
    if (!key || !title) {
      throw new ProposalApplyError(
        "create risk requires after.key and after.title",
      );
    }
    const [created] = await db
      .insert(risks)
      .values({
        workspaceId,
        key,
        title,
        description: asString(after.description) ?? "",
        criticality: asPriority(after.criticality),
      })
      .returning();
    keyToId.set(`risk:${key}`, created.id);
    applied.push({
      action: "create",
      entityType: "risk",
      id: created.id,
      key,
    });
    return;
  }

  if (diff.entityType === "component") {
    const title = asString(after.title);
    if (!key || !title) {
      throw new ProposalApplyError(
        "create component requires after.key and after.title",
      );
    }
    const [created] = await db
      .insert(components)
      .values({
        workspaceId,
        key,
        title,
        description: asString(after.description) ?? "",
        criticality: asPriority(after.criticality),
      })
      .returning();
    keyToId.set(`component:${key}`, created.id);
    applied.push({
      action: "create",
      entityType: "component",
      id: created.id,
      key,
    });
    return;
  }

  if (diff.entityType === "implementation") {
    const intentId =
      asString(after.intentId) ??
      (asString(after.intentKey)
        ? (keyToId.get(`intent:${asString(after.intentKey)}`) ??
          (await resolveEntityIdByKey(
            workspaceId,
            "intent",
            asString(after.intentKey)!,
          )))
        : null);
    const type = asString(after.type);
    if (!intentId || !type || !IMPL_TYPES.has(type)) {
      throw new ProposalApplyError(
        "create implementation requires intentId/intentKey and a valid type",
      );
    }
    const [created] = await db
      .insert(testImplementations)
      .values({
        workspaceId,
        intentId,
        type: type as
          | "manual"
          | "junit"
          | "playwright"
          | "api"
          | "unit"
          | "agent",
        sourcePath: asString(after.sourcePath),
        externalKey: asString(after.externalKey),
        framework: asString(after.framework),
      })
      .returning();
    applied.push({
      action: "create",
      entityType: "implementation",
      id: created.id,
    });
    return;
  }

  throw new ProposalApplyError(
    `Unsupported create entityType: ${diff.entityType}`,
  );
}

async function applyLinkDiff(
  workspaceId: string,
  diff: ProposalDiff,
  applied: ApplyResult["applied"],
  keyToId: Map<string, string>,
): Promise<void> {
  const after = diff.after ?? {};
  const fromType = asString(after.fromType);
  const toType = asString(after.toType);
  const relation = asString(after.relation);
  if (
    !fromType ||
    !toType ||
    !relation ||
    !ENTITY_TYPES.has(fromType) ||
    !ENTITY_TYPES.has(toType) ||
    !RELATIONS.has(relation)
  ) {
    throw new ProposalApplyError(
      "link requires valid after.fromType, toType, and relation",
    );
  }

  let fromId = asString(after.fromId);
  let toId = asString(after.toId);
  const fromKey = asString(after.fromKey);
  const toKey = asString(after.toKey);

  if (!fromId && fromKey) {
    fromId =
      keyToId.get(`${fromType}:${fromKey}`) ??
      (await resolveEntityIdByKey(workspaceId, fromType, fromKey));
  }
  if (!toId && toKey) {
    toId =
      keyToId.get(`${toType}:${toKey}`) ??
      (await resolveEntityIdByKey(workspaceId, toType, toKey));
  }

  if (!fromId || !toId) {
    throw new ProposalApplyError(
      "link requires fromId/fromKey and toId/toKey that resolve in the workspace",
    );
  }

  const existing = await db.query.qualityEdges.findFirst({
    where: and(
      eq(qualityEdges.workspaceId, workspaceId),
      eq(
        qualityEdges.fromType,
        fromType as
          | "intent"
          | "requirement"
          | "risk"
          | "component"
          | "case"
          | "implementation"
          | "journey",
      ),
      eq(qualityEdges.fromId, fromId),
      eq(
        qualityEdges.toType,
        toType as
          | "intent"
          | "requirement"
          | "risk"
          | "component"
          | "case"
          | "implementation"
          | "journey",
      ),
      eq(qualityEdges.toId, toId),
      eq(
        qualityEdges.relation,
        relation as
          | "covers"
          | "mitigates"
          | "belongs_to"
          | "implements"
          | "part_of",
      ),
    ),
  });
  if (existing) {
    applied.push({
      action: "link",
      entityType: "edge",
      id: existing.id,
    });
    return;
  }

  const [created] = await db
    .insert(qualityEdges)
    .values({
      workspaceId,
      fromType: fromType as
        | "intent"
        | "requirement"
        | "risk"
        | "component"
        | "case"
        | "implementation"
        | "journey",
      fromId,
      toType: toType as
        | "intent"
        | "requirement"
        | "risk"
        | "component"
        | "case"
        | "implementation"
        | "journey",
      toId,
      relation: relation as
        | "covers"
        | "mitigates"
        | "belongs_to"
        | "implements"
        | "part_of",
    })
    .returning();
  applied.push({
    action: "link",
    entityType: "edge",
    id: created.id,
  });
}

async function applyUpdateDiff(
  workspaceId: string,
  diff: ProposalDiff,
  applied: ApplyResult["applied"],
): Promise<void> {
  const entityId = asString(diff.entityId);
  if (!entityId) {
    throw new ProposalApplyError("update requires entityId");
  }
  const after = diff.after ?? {};

  if (diff.entityType === "intent") {
    const patch: Partial<typeof testIntents.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (asString(after.title)) patch.title = asString(after.title)!;
    if (asString(after.behavior) !== null) {
      patch.behavior = asString(after.behavior) ?? "";
    }
    if (after.criticality !== undefined) {
      patch.criticality = asPriority(after.criticality);
    }
    if (after.status !== undefined) patch.status = asCaseStatus(after.status);
    const [updated] = await db
      .update(testIntents)
      .set(patch)
      .where(
        and(
          eq(testIntents.id, entityId),
          eq(testIntents.workspaceId, workspaceId),
        ),
      )
      .returning();
    if (!updated) {
      throw new ProposalApplyError("Intent not found for update", 404);
    }
    applied.push({
      action: "update",
      entityType: "intent",
      id: updated.id,
      key: updated.key,
    });
    return;
  }

  if (diff.entityType === "requirement") {
    const patch: Partial<typeof requirements.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (asString(after.title)) patch.title = asString(after.title)!;
    if (after.description !== undefined) {
      patch.description = asString(after.description) ?? "";
    }
    if (after.criticality !== undefined) {
      patch.criticality = asPriority(after.criticality);
    }
    const [updated] = await db
      .update(requirements)
      .set(patch)
      .where(
        and(
          eq(requirements.id, entityId),
          eq(requirements.workspaceId, workspaceId),
        ),
      )
      .returning();
    if (!updated) {
      throw new ProposalApplyError("Requirement not found for update", 404);
    }
    applied.push({
      action: "update",
      entityType: "requirement",
      id: updated.id,
      key: updated.key,
    });
    return;
  }

  throw new ProposalApplyError(
    `Unsupported update entityType: ${diff.entityType}`,
  );
}

/**
 * Apply a validated proposal payload to the quality graph.
 * Only call after an explicit human accept.
 */
export async function applyProposalPayload(
  workspaceId: string,
  payload: ProposalPayload,
  provenance?: ProposalApplyProvenance,
): Promise<ApplyResult> {
  const applied: ApplyResult["applied"] = [];
  const keyToId = new Map<string, string>();

  for (const diff of payload.diffs) {
    if (diff.action === "create") {
      await applyCreateDiff(workspaceId, diff, applied, keyToId);
    } else if (diff.action === "link") {
      await applyLinkDiff(workspaceId, diff, applied, keyToId);
    } else if (diff.action === "update") {
      await applyUpdateDiff(workspaceId, diff, applied);
    } else {
      throw new ProposalApplyError(`Unknown action: ${String(diff.action)}`);
    }
  }

  return provenance ? { applied, provenance } : { applied };
}

export async function reviewProposal(opts: {
  workspaceId: string;
  proposalId: string;
  decision: "accepted" | "rejected";
  approvedById: string;
}): Promise<{
  proposal: ProposalListItem;
  applied?: ApplyResult["applied"];
  provenance?: ProposalApplyProvenance;
}> {
  const row = await db.query.proposals.findFirst({
    where: and(
      eq(proposals.id, opts.proposalId),
      eq(proposals.workspaceId, opts.workspaceId),
    ),
  });
  if (!row) {
    throw new ProposalApplyError("Proposal not found", 404);
  }
  if (!isProposalStatus(row.status) || row.status !== "pending") {
    throw new ProposalApplyError("Only pending proposals can be reviewed", 409);
  }

  if (opts.decision === "rejected") {
    const [updated] = await db
      .update(proposals)
      .set({
        status: "rejected",
        approvedById: opts.approvedById,
        updatedAt: new Date(),
      })
      .where(eq(proposals.id, row.id))
      .returning();
    return { proposal: toProposalListItem(updated) };
  }

  const payload = parseProposalPayload(row.payloadJson);
  const provenance = proposalApplyProvenance(row, opts.approvedById);
  let applied: ApplyResult["applied"];
  let applyMeta: ProposalApplyProvenance | undefined;
  try {
    const result = await applyProposalPayload(
      opts.workspaceId,
      payload,
      provenance,
    );
    applied = result.applied;
    applyMeta = result.provenance;
  } catch (err) {
    if (err instanceof ProposalApplyError) throw err;
    throw new ProposalApplyError(
      err instanceof Error ? err.message : "Failed to apply proposal",
      400,
    );
  }

  const [updated] = await db
    .update(proposals)
    .set({
      status: "accepted",
      approvedById: opts.approvedById,
      updatedAt: new Date(),
    })
    .where(eq(proposals.id, row.id))
    .returning();

  return {
    proposal: toProposalListItem(updated),
    applied,
    provenance: applyMeta,
  };
}
