/**
 * AI proposal / governance types (Phase 7 domain core).
 *
 * Models and agents propose graph diffs; humans accept, modify, or reject.
 * Topology never writes model output straight into the graph.
 */

export const proposalEntityTypes = [
  "intent",
  "requirement",
  "risk",
  "component",
  "implementation",
  "edge",
] as const;

export type ProposalEntityType = (typeof proposalEntityTypes)[number];

export const proposalActions = ["create", "update", "link"] as const;

export type ProposalAction = (typeof proposalActions)[number];

export const proposalStatuses = ["pending", "accepted", "rejected"] as const;

export type ProposalStatus = (typeof proposalStatuses)[number];

export const proposalActorTypes = ["user", "agent", "model"] as const;

export type ProposalActorType = (typeof proposalActorTypes)[number];

/** JSON-ish snapshot of entity (or edge) fields for before/after. */
export type ProposalSnapshot = Record<string, unknown>;

/**
 * One proposed graph mutation.
 *
 * - `create`: `before` is null; `after` holds new entity fields
 * - `update`: both `before` and `after` are object snapshots
 * - `link`: `after` describes the edge (from/to/relation); `before` null or prior edge
 */
export type ProposalDiff = {
  entityType: ProposalEntityType;
  action: ProposalAction;
  /** Existing entity id when updating or linking to a known node. */
  entityId?: string | null;
  before: ProposalSnapshot | null;
  after: ProposalSnapshot | null;
};

/**
 * Payload stored as `proposals.payloadJson` — one or more diffs plus optional rationale.
 */
export type ProposalPayload = {
  diffs: ProposalDiff[];
  /** Human/agent-readable summary of why this was proposed. */
  rationale?: string;
};

/**
 * Review-queue row shape (domain view of a proposal record).
 * Persistence fields (ids, model, approvedBy) live in the app schema.
 */
export type Proposal = {
  status: ProposalStatus;
  payload: ProposalPayload;
  actorType?: ProposalActorType;
  model?: string | null;
  inputRefs?: string[];
};

const ENTITY_SET = new Set<string>(proposalEntityTypes);
const ACTION_SET = new Set<string>(proposalActions);
const STATUS_SET = new Set<string>(proposalStatuses);
const ACTOR_SET = new Set<string>(proposalActorTypes);

export type ProposalValidationIssue = {
  path: string;
  message: string;
};

export type ProposalValidationResult =
  | { ok: true; payload: ProposalPayload }
  | { ok: false; issues: ProposalValidationIssue[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateSnapshot(
  value: unknown,
  path: string,
  issues: ProposalValidationIssue[],
  { allowNull }: { allowNull: boolean },
): value is ProposalSnapshot | null {
  if (value === null) {
    if (!allowNull) {
      issues.push({ path, message: "must be an object (not null)" });
      return false;
    }
    return true;
  }
  if (!isPlainObject(value)) {
    issues.push({ path, message: "must be an object or null" });
    return false;
  }
  return true;
}

function validateDiff(
  diff: unknown,
  base: string,
  issues: ProposalValidationIssue[],
): void {
  if (!isPlainObject(diff)) {
    issues.push({ path: base, message: "diff must be an object" });
    return;
  }

  if (typeof diff.entityType !== "string" || !ENTITY_SET.has(diff.entityType)) {
    issues.push({
      path: `${base}.entityType`,
      message: `entityType must be one of: ${proposalEntityTypes.join(", ")}`,
    });
  }

  const action = diff.action;
  if (typeof action !== "string" || !ACTION_SET.has(action)) {
    issues.push({
      path: `${base}.action`,
      message: `action must be one of: ${proposalActions.join(", ")}`,
    });
    return;
  }

  if (
    "entityId" in diff &&
    diff.entityId !== undefined &&
    diff.entityId !== null &&
    typeof diff.entityId !== "string"
  ) {
    issues.push({
      path: `${base}.entityId`,
      message: "entityId must be a string, null, or omitted",
    });
  }

  if (action === "create") {
    validateSnapshot(diff.before, `${base}.before`, issues, { allowNull: true });
    if (diff.before !== null && diff.before !== undefined) {
      issues.push({
        path: `${base}.before`,
        message: "create action requires before to be null",
      });
    }
    validateSnapshot(diff.after, `${base}.after`, issues, { allowNull: false });
  } else if (action === "update") {
    validateSnapshot(diff.before, `${base}.before`, issues, { allowNull: false });
    validateSnapshot(diff.after, `${base}.after`, issues, { allowNull: false });
  } else {
    // link
    validateSnapshot(diff.before, `${base}.before`, issues, { allowNull: true });
    validateSnapshot(diff.after, `${base}.after`, issues, { allowNull: false });
  }
}

/**
 * Validate a ProposalPayload (or unknown JSON) without applying it to the graph.
 */
export function validateProposalPayload(
  input: unknown,
): ProposalValidationResult {
  const issues: ProposalValidationIssue[] = [];

  if (!isPlainObject(input)) {
    return {
      ok: false,
      issues: [{ path: "", message: "payload must be an object" }],
    };
  }

  if (!Array.isArray(input.diffs)) {
    issues.push({ path: "diffs", message: "diffs must be an array" });
  } else if (input.diffs.length === 0) {
    // Explanation-only proposals (e.g. change-impact text) may have rationale
    // with no graph diffs; accept applies nothing.
    const rationaleOk =
      typeof input.rationale === "string" && input.rationale.trim().length > 0;
    if (!rationaleOk) {
      issues.push({
        path: "diffs",
        message: "diffs must be non-empty unless rationale is set",
      });
    }
  } else {
    input.diffs.forEach((diff, i) => {
      validateDiff(diff, `diffs[${i}]`, issues);
    });
  }

  if (
    "rationale" in input &&
    input.rationale !== undefined &&
    typeof input.rationale !== "string"
  ) {
    issues.push({
      path: "rationale",
      message: "rationale must be a string when present",
    });
  }

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const payload: ProposalPayload = {
    diffs: input.diffs as ProposalDiff[],
  };
  if (typeof input.rationale === "string") {
    payload.rationale = input.rationale;
  }

  return { ok: true, payload };
}

/** Narrow helper: returns true when `input` is a valid ProposalPayload. */
export function isProposalPayload(input: unknown): input is ProposalPayload {
  return validateProposalPayload(input).ok;
}

/** Validate a proposal status string. */
export function isProposalStatus(value: unknown): value is ProposalStatus {
  return typeof value === "string" && STATUS_SET.has(value);
}

/** Validate a proposal actor type string. */
export function isProposalActorType(value: unknown): value is ProposalActorType {
  return typeof value === "string" && ACTOR_SET.has(value);
}
