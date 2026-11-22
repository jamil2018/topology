import { and, desc, eq, isNull } from "drizzle-orm";
import {
  isProposalActorType,
  isProposalStatus,
  validateProposalPayload,
  type ProposalDiff,
  type ProposalPayload,
} from "@topology/domain";
import { db } from "@/db";
import { recordCaseActivity } from "@/lib/case-activity";
import { readCaseRevision } from "@/lib/case-revision";
import { lockCaseReviewPolicy } from "@/lib/case-review-policy";
import { buildCasePatch, updateCaseSchema } from "@/lib/case-update";
import { replaceCaseParameters, replaceCaseSteps, snapshotCaseVersion, upsertCustomFieldValues } from "@/lib/tcm/case-tcm";
import { createCaseSchema, persistCase } from "@/lib/case-create";
import { membershipActions, membershipCanAdmin, type MembershipWithRole } from "@/lib/project";
import { roleHasAction } from "@/lib/permissions";
import { createPlanSchema, savePlan, updatePlanSchema } from "@/lib/tcm/plans";
import { runTemplateSchema } from "@/lib/run-template";
import { saveRunTemplate } from "@/lib/run-template-access";
import { isUuid } from "@/lib/queries/ids";
import {
  auditEvents,
  cases,
  folders,
  sharedSteps,
  components,
  journeys,
  proposals,
  qualityEdges,
  requirements,
  risks,
  testImplementations,
  testIntents,
  workspaceMembers,
  workspaces,
  type Proposal as ProposalRow,
} from "@/db/schema";
import {
  getAiProviderConfig,
  isAiProviderEnabled as isAiConfigEnabled,
} from "@/lib/ai-provider";

const PRIORITIES = new Set(["P0", "P1", "P2", "P3"]);
const CASE_STATUSES = new Set([
  "draft",
  "in_review",
  "ready",
  "blocked",
  "deprecated",
]);
const ENTITY_TYPES = new Set([
  "case",
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
  tx?: ProposalTransaction,
): Promise<ProposalRow> {
  const actorType = isProposalActorType(input.actorType)
    ? input.actorType
    : "agent";
  const entityType =
    input.entityType?.trim() ||
    input.payload.diffs[0]?.entityType ||
    "intent";

  const [row] = await (tx ?? db)
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

  if (!tx) notifyProposalCreated(row, input.payload.diffs.length);
  return row;
}

export function notifyProposalCreated(row: ProposalRow, diffCount: number) {
  const proposalPayload = {
    proposalId: row.id,
    entityType: row.entityType,
    status: row.status,
    actorType: row.actorType,
    model: row.model,
    diffCount,
  };
  void import("@/lib/webhooks").then(({ dispatchWebhook }) =>
    dispatchWebhook("proposal.created", proposalPayload, row.workspaceId),
  ).catch(() => {});
  void import("@/lib/notification-channels")
    .then(({ dispatchNotificationChannels }) =>
      dispatchNotificationChannels(
        "proposal.created",
        proposalPayload,
        row.workspaceId,
      ),
    )
    .catch(() => {});
}

type ProposalTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

type ApplyResult = {
  applied: Array<{
    action: string;
    entityType: string;
    id: string;
    key?: string;
  }>;
  provenance?: ProposalApplyProvenance;
};

const proposalEntities = {
  case: cases,
  folder: folders,
  shared_step: sharedSteps,
  intent: testIntents,
  requirement: requirements,
  risk: risks,
  component: components,
  implementation: testImplementations,
  journey: journeys,
} as const;

async function requireProjectEntity(
  tx: ProposalTransaction,
  workspaceId: string,
  type: string,
  id: string,
) {
  const table = proposalEntities[type as keyof typeof proposalEntities];
  if (!table || !isUuid(id)) {
    throw new ProposalApplyError("Proposal references an invalid entity");
  }
  const [row] = await tx.select({ id: table.id }).from(table)
    .where(and(eq(table.id, id), eq(table.workspaceId, workspaceId)))
    .for("key share");
  if (!row) throw new ProposalApplyError("Proposal entity not found in project", 404);
}

function assertCurrentRevision(
  row: Record<string, unknown> | undefined,
  diff: ProposalDiff,
) {
  if (!row) throw new ProposalApplyError("Proposal entity not found in project", 404);
  for (const [field, expected] of Object.entries(diff.before ?? {})) {
    const current = row[field];
    const actual = current instanceof Date ? current.toISOString() : current;
    if (!Object.hasOwn(row, field) || JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new ProposalApplyError("Proposal is stale. Refresh the entity and submit a new proposal", 409);
    }
  }
}

async function resolveEntityIdByKey(
  tx: ProposalTransaction,
  workspaceId: string,
  entityType: string,
  key: string,
): Promise<string | null> {
  if (entityType === "intent") {
    const row = await tx.query.testIntents.findFirst({
      where: and(
        eq(testIntents.workspaceId, workspaceId),
        eq(testIntents.key, key),
      ),
    });
    return row?.id ?? null;
  }
  if (entityType === "requirement") {
    const row = await tx.query.requirements.findFirst({
      where: and(
        eq(requirements.workspaceId, workspaceId),
        eq(requirements.key, key),
      ),
    });
    return row?.id ?? null;
  }
  if (entityType === "risk") {
    const row = await tx.query.risks.findFirst({
      where: and(eq(risks.workspaceId, workspaceId), eq(risks.key, key)),
    });
    return row?.id ?? null;
  }
  if (entityType === "component") {
    const row = await tx.query.components.findFirst({
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
  tx: ProposalTransaction,
  workspaceId: string,
  diff: ProposalDiff,
  applied: ApplyResult["applied"],
  keyToId: Map<string, string>,
  authorId: string | null,
): Promise<void> {
  const after = diff.after ?? {};
  const key = asString(after.key);

  if (diff.entityType === "case") {
    const proposed = createCaseSchema.safeParse({ ...after, status: "ready", assigneeId: null });
    if (!proposed.success) throw new ProposalApplyError("Invalid proposed case fields");
    if (proposed.data.folderId) {
      await requireProjectEntity(tx, workspaceId, "folder", proposed.data.folderId);
    }
    const sharedIds = new Set(proposed.data.structuredSteps?.flatMap(
      (step) => step.sharedStepId ? [step.sharedStepId] : [],
    ));
    for (const id of sharedIds) await requireProjectEntity(tx, workspaceId, "shared_step", id);
    const created = await persistCase(tx, workspaceId, authorId, proposed.data);
    keyToId.set(`case:${created.key}`, created.id);
    keyToId.set(`intent:${created.key}`, created.intentId);
    applied.push({ action: "create", entityType: "case", id: created.id, key: created.key });
    return;
  }

  if (diff.entityType === "intent") {
    const title = asString(after.title);
    if (!key || !title) {
      throw new ProposalApplyError(
        "create intent requires after.key and after.title",
      );
    }
    const [created] = await tx
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
    const [created] = await tx
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
    const [created] = await tx
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
    const [created] = await tx
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
            tx,
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
    await requireProjectEntity(tx, workspaceId, "intent", intentId);
    const [created] = await tx
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
  tx: ProposalTransaction,
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
      (await resolveEntityIdByKey(tx, workspaceId, fromType, fromKey));
  }
  if (!toId && toKey) {
    toId =
      keyToId.get(`${toType}:${toKey}`) ??
      (await resolveEntityIdByKey(tx, workspaceId, toType, toKey));
  }

  if (!fromId || !toId) {
    throw new ProposalApplyError(
      "link requires fromId/fromKey and toId/toKey that resolve in the workspace",
    );
  }

  await requireProjectEntity(tx, workspaceId, fromType, fromId);
  await requireProjectEntity(tx, workspaceId, toType, toId);
  const existing = await tx.query.qualityEdges.findFirst({
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

  const [created] = await tx
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

async function applyReviewedCaseEdit(
  tx: ProposalTransaction,
  workspaceId: string,
  caseId: string,
  diff: ProposalDiff,
  provenance: ProposalApplyProvenance,
) {
  const [row] = await tx.select().from(cases).where(and(
    eq(cases.workspaceId, workspaceId), eq(cases.id, caseId),
  )).for("update");
  if (!row) throw new ProposalApplyError("Case not found in project", 404);
  if (row.status === "in_review" && await lockCaseReviewPolicy(tx, workspaceId)) {
    throw new ProposalApplyError("Request changes on the assigned review before applying a proposal to this case", 409);
  }
  const current = await readCaseRevision(workspaceId, caseId, tx);
  if (!current || current.revision !== diff.before?.revision) {
    throw new ProposalApplyError("Case revision changed. Refresh the case and submit a new proposal", 409);
  }
  const parsed = updateCaseSchema.safeParse({
    ...diff.after,
    reviewerId: undefined,
    reviewComment: undefined,
  });
  if (!parsed.success || (parsed.data.status && !["ready", "deprecated"].includes(parsed.data.status))) {
    throw new ProposalApplyError("Invalid reviewed case edit");
  }
  const planned = parsed.data;
  if (planned.folderId) await requireProjectEntity(tx, workspaceId, "folder", planned.folderId);
  if (planned.structuredSteps) {
    const ids = new Set(planned.structuredSteps.flatMap(({ sharedStepId }) => sharedStepId ? [sharedStepId] : []));
    for (const id of ids) await requireProjectEntity(tx, workspaceId, "shared_step", id);
  }

  const { patch } = buildCasePatch(row, planned);
  await tx.update(cases).set({
    ...patch,
    priority: planned.priority ?? row.priority,
    status: planned.status ?? row.status,
    reviewerId: provenance.approvedById,
    reviewedAt: new Date(),
    updatedAt: new Date(),
  }).where(eq(cases.id, caseId));

  if (planned.structuredSteps) await replaceCaseSteps({ workspaceId, caseId, steps: planned.structuredSteps }, tx);
  if (planned.parameters || planned.datasets) {
    await replaceCaseParameters({
      caseId,
      parameters: planned.parameters ?? current.definition.parameters,
      datasets: planned.datasets,
    }, tx);
  }
  if (planned.customFields) {
    const fields = await upsertCustomFieldValues({ workspaceId, entityType: "case", entityId: caseId, values: planned.customFields }, tx);
    if (!fields.ok) throw new ProposalApplyError(fields.error);
  }
  await recordCaseActivity({
    caseId,
    actorId: provenance.approvedById,
    approvedById: provenance.approvedById,
    generatedBy: provenance.generatedBy,
    model: provenance.model,
    action: "approved",
    summary: "Applied reviewed case changes",
  }, tx);
  await snapshotCaseVersion({
    workspaceId, caseId, actorId: provenance.approvedById, summary: "Reviewed case revision",
  }, tx);
  return row.key;
}

async function applyUpdateDiff(
  tx: ProposalTransaction,
  workspaceId: string,
  diff: ProposalDiff,
  applied: ApplyResult["applied"],
  provenance: ProposalApplyProvenance,
): Promise<void> {
  const entityId = asString(diff.entityId);
  if (!entityId || !isUuid(entityId)) {
    throw new ProposalApplyError("update requires a valid entityId");
  }
  const after = diff.after ?? {};

  if (diff.entityType === "case") {
    const key = await applyReviewedCaseEdit(tx, workspaceId, entityId, diff, provenance);
    applied.push({ action: "update", entityType: "case", id: entityId, key });
    return;
  }

  if (diff.entityType === "intent") {
    const [current] = await tx.select().from(testIntents).where(and(
      eq(testIntents.id, entityId),
      eq(testIntents.workspaceId, workspaceId),
    )).for("update");
    assertCurrentRevision(current, diff);
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
    const [updated] = await tx
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
    const [current] = await tx.select().from(requirements).where(and(
      eq(requirements.id, entityId),
      eq(requirements.workspaceId, workspaceId),
    )).for("update");
    assertCurrentRevision(current, diff);
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
    const [updated] = await tx
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

  if (diff.entityType === "implementation") {
    const newIntentId = asString(after.intentId);
    if (!newIntentId || !diff.before?.intentId) {
      throw new ProposalApplyError("Relinking requires the current and proposed intent IDs");
    }
    const [current] = await tx.select().from(testImplementations).where(and(
      eq(testImplementations.id, entityId),
      eq(testImplementations.workspaceId, workspaceId),
    )).for("update");
    assertCurrentRevision(current, diff);
    await requireProjectEntity(tx, workspaceId, "intent", newIntentId);
    if (current.caseId) throw new ProposalApplyError("Case-backed implementations follow their case intent", 409);
    await tx.update(testImplementations).set({ intentId: newIntentId, updatedAt: new Date() })
      .where(eq(testImplementations.id, entityId));
    applied.push({ action: "update", entityType: "implementation", id: entityId });
    return;
  }

  throw new ProposalApplyError(
    `Unsupported update entityType: ${diff.entityType}`,
  );
}

async function applyExecutionDefinition(
  tx: ProposalTransaction,
  workspaceId: string,
  diff: ProposalDiff,
  authorId: string | null,
  reviewer: MembershipWithRole,
): Promise<ApplyResult["applied"][number]> {
  if (diff.action === "link") throw new ProposalApplyError("Plans and templates support create and update proposals");
  const actions = membershipActions(reviewer);
  const updating = diff.action === "update";
  const entityId = diff.entityId;
  const revision = diff.before?.revision;
  if (updating && (!entityId || !isUuid(entityId) || typeof revision !== "string" || !/^[a-f0-9]{64}$/.test(revision))) {
    throw new ProposalApplyError("An update needs a valid entity ID and current revision");
  }
  const template = diff.entityType === "run_template";
  const canEditAny = template && updating && membershipCanAdmin(reviewer, actions);
  if (!canEditAny && !roleHasAction(actions, updating && !template ? "runs.edit" : "runs.create")) {
    throw new ProposalApplyError("The reviewer needs permission to change this plan or template", 403);
  }
  const common = { workspaceId, actorId: authorId ?? reviewer.userId };
  let id: string;
  if (template) {
    const parsed = runTemplateSchema.safeParse(diff.after);
    if (!parsed.success) throw new ProposalApplyError("Invalid proposed template fields");
    const saved = await saveRunTemplate({
      ...common, data: parsed.data, canEditAny,
      ...(updating ? { actorId: reviewer.userId, templateId: entityId!, revision: revision as string } : {}),
    }, tx);
    if (!saved.ok) throw new ProposalApplyError(saved.error, saved.status);
    id = saved.template.id;
  } else if (updating) {
    const parsed = updatePlanSchema.safeParse(diff.after);
    if (!parsed.success || Object.keys(parsed.data).length === 0) throw new ProposalApplyError("Invalid proposed plan update");
    const saved = await savePlan({ ...common, planId: entityId!, revision: revision as string, data: parsed.data }, tx);
    if (!saved.ok) throw new ProposalApplyError(saved.error, saved.status);
    id = saved.plan.id;
  } else {
    const parsed = createPlanSchema.safeParse(diff.after);
    if (!parsed.success) throw new ProposalApplyError("Invalid proposed plan fields");
    const saved = await savePlan({ ...common, data: parsed.data }, tx);
    if (!saved.ok) throw new ProposalApplyError(saved.error, saved.status);
    id = saved.plan.id;
  }
  return { action: diff.action, entityType: diff.entityType, id };
}

/**
 * Apply a validated proposal payload to the project.
 * Only call after an explicit human accept.
 */
async function applyProposalPayload(
  tx: ProposalTransaction,
  workspaceId: string,
  payload: ProposalPayload,
  authorId: string | null,
  provenance: ProposalApplyProvenance,
  reviewer: MembershipWithRole,
): Promise<ApplyResult> {
  const applied: ApplyResult["applied"] = [];
  const keyToId = new Map<string, string>();

  for (const diff of payload.diffs) {
    if (diff.entityType === "plan" || diff.entityType === "run_template") {
      applied.push(await applyExecutionDefinition(tx, workspaceId, diff, authorId, reviewer));
    } else if (diff.action === "create") {
      await applyCreateDiff(tx, workspaceId, diff, applied, keyToId, authorId);
    } else if (diff.action === "link") {
      await applyLinkDiff(tx, workspaceId, diff, applied, keyToId);
    } else if (diff.action === "update") {
      await applyUpdateDiff(tx, workspaceId, diff, applied, provenance);
    } else {
      throw new ProposalApplyError(`Unknown action: ${String(diff.action)}`);
    }
  }

  return { applied, provenance };
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
  return db.transaction(async (tx) => {
    const [allowedProject] = await tx.select({ id: workspaceMembers.id, requireCaseReview: workspaces.requireCaseReview }).from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(and(
        eq(workspaceMembers.workspaceId, opts.workspaceId),
        eq(workspaceMembers.userId, opts.approvedById),
        isNull(workspaces.archivedAt),
      )).for("share");
    const reviewer = allowedProject && await tx.query.workspaceMembers.findFirst({
      where: eq(workspaceMembers.id, allowedProject.id), with: { customRole: true },
    });
    if (!reviewer || !roleHasAction(membershipActions(reviewer), "proposals.review")) {
      throw new ProposalApplyError("Proposal review permission required", 403);
    }
    const [row] = await tx.select().from(proposals).where(and(
      eq(proposals.id, opts.proposalId),
      eq(proposals.workspaceId, opts.workspaceId),
    )).for("update");

    if (!row) throw new ProposalApplyError("Proposal not found", 404);
    if (row.status === opts.decision && row.approvedById === opts.approvedById) {
      return { proposal: toProposalListItem(row) };
    }
    if (!isProposalStatus(row.status) || row.status !== "pending") {
      throw new ProposalApplyError("Only pending proposals can be reviewed", 409);
    }

    const payload = opts.decision === "accepted" ? parseProposalPayload(row.payloadJson) : null;
    if (allowedProject.requireCaseReview && payload?.diffs.some((diff) => diff.entityType === "case") &&
      !roleHasAction(membershipActions(reviewer), "cases.approve")) {
      throw new ProposalApplyError("Case approval permission required", 403);
    }
    const result = payload
      ? await applyProposalPayload(
          tx,
          opts.workspaceId,
          payload,
          row.createdById,
          proposalApplyProvenance(row, opts.approvedById),
          reviewer,
        )
      : undefined;

    const [updated] = await tx.update(proposals).set({
      status: opts.decision,
      approvedById: opts.approvedById,
      updatedAt: new Date(),
    }).where(eq(proposals.id, row.id)).returning();

    await tx.insert(auditEvents).values({
      action: `proposal.${opts.decision}`,
      actorId: opts.approvedById,
      workspaceId: opts.workspaceId,
      targetType: "proposal",
      targetId: row.id,
      metadataJson: JSON.stringify({
        inputRefs: parseInputRefs(row.inputRefs),
        applied: result?.applied ?? [],
      }),
    });

    return { proposal: toProposalListItem(updated), ...result };
  });
}
