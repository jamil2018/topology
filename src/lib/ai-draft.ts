import { and, eq } from "drizzle-orm";
import type { ProposalDiff, ProposalPayload } from "@topology/domain";
import { validateProposalPayload } from "@topology/domain";
import { db } from "@/db";
import {
  qualityEdges,
  requirements,
  testIntents,
} from "@/db/schema";
import {
  completeChat,
  getWorkspaceAiProviderConfig,
  isAiProviderEnabled,
  type AiProviderConfig,
} from "@/lib/ai-provider";
import { createProposal } from "@/lib/proposals";

const DRAFT_SYSTEM = `You are a quality-engineering assistant for Topology.
Respond with JSON only (no markdown fences): { "rationale": string, "diffs": ProposalDiff[] }.
Each diff must use entityType intent|requirement|risk|component|implementation|edge, action create|update|link, before null or object, after object.
For create intent: after must include key and title. For link (covers): after includes fromType, toType, relation, fromId or fromKey, toId or toKey.`;

export type DraftJobResult =
  | { disabled: true }
  | {
      disabled?: false;
      proposalId: string;
      heuristic: boolean;
      model: string;
    };

function slugKey(prefix: string, title: string): string {
  const base = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  const suffix = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${base || "DRAFT"}-${suffix}`;
}

function parseLlmPayload(raw: string): ProposalPayload | null {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }
  const validated = validateProposalPayload(parsed);
  if (!validated.ok) return null;
  return validated.payload;
}

async function runDraftWithFallback(opts: {
  workspaceId: string;
  config: AiProviderConfig;
  inputRefs: string[];
  entityType: string;
  userPrompt: string;
  heuristic: () => ProposalPayload;
  createdById?: string | null;
}): Promise<DraftJobResult> {
  let payload: ProposalPayload | null = null;
  let modelLabel = "heuristic";
  let heuristic = true;

  if (isAiProviderEnabled(opts.config)) {
    try {
      const chat = await completeChat({
        system: DRAFT_SYSTEM,
        user: opts.userPrompt,
        config: opts.config,
      });
      if (chat?.content) {
        payload = parseLlmPayload(chat.content);
        if (payload) {
          modelLabel = chat.model;
          heuristic = false;
        }
      }
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    payload = opts.heuristic();
    modelLabel = heuristic ? "heuristic" : modelLabel;
    heuristic = true;
  }

  const row = await createProposal({
    workspaceId: opts.workspaceId,
    payload,
    entityType: opts.entityType,
    actorType: "model",
    model: modelLabel,
    inputRefs: opts.inputRefs,
    createdById: opts.createdById ?? null,
  });

  return {
    proposalId: row.id,
    heuristic,
    model: modelLabel,
  };
}

export async function draftIntentsFromRequirement(input: {
  workspaceId: string;
  requirementId: string;
  createdById?: string | null;
  config?: AiProviderConfig;
  allowHeuristic?: boolean;
}): Promise<DraftJobResult> {
  const config =
    input.config ?? (await getWorkspaceAiProviderConfig(input.workspaceId));
  if (!isAiProviderEnabled(config) && !input.allowHeuristic) {
    return { disabled: true };
  }

  const req = await db.query.requirements.findFirst({
    where: and(
      eq(requirements.id, input.requirementId),
      eq(requirements.workspaceId, input.workspaceId),
    ),
  });
  if (!req) {
    throw new Error("Requirement not found");
  }

  return runDraftWithFallback({
    workspaceId: input.workspaceId,
    config,
    inputRefs: [req.id],
    entityType: "intent",
    createdById: input.createdById,
    userPrompt: `Draft one test intent that covers requirement ${req.key}: ${req.title}. Description: ${req.description}`,
    heuristic: () => {
      const key = slugKey("INT", req.title);
      const diffs: ProposalDiff[] = [
        {
          entityType: "intent",
          action: "create",
          before: null,
          after: {
            key,
            title: `Verify: ${req.title}`,
            behavior: req.description || req.title,
            criticality: req.criticality,
            status: "draft",
          },
        },
        {
          entityType: "edge",
          action: "link",
          before: null,
          after: {
            fromType: "intent",
            fromKey: key,
            toType: "requirement",
            toId: req.id,
            relation: "covers",
          },
        },
      ];
      return {
        rationale: `Heuristic draft intent for requirement ${req.key}`,
        diffs,
      };
    },
  });
}

export async function suggestNegativePaths(input: {
  workspaceId: string;
  intentId?: string;
  requirementId?: string;
  createdById?: string | null;
  config?: AiProviderConfig;
  allowHeuristic?: boolean;
}): Promise<DraftJobResult> {
  const config =
    input.config ?? (await getWorkspaceAiProviderConfig(input.workspaceId));
  if (!isAiProviderEnabled(config) && !input.allowHeuristic) {
    return { disabled: true };
  }

  let contextTitle = "quality behavior";
  let inputRefs: string[] = [];
  const anchorIntentId: string | null = input.intentId ?? null;

  if (input.intentId) {
    const intent = await db.query.testIntents.findFirst({
      where: and(
        eq(testIntents.id, input.intentId),
        eq(testIntents.workspaceId, input.workspaceId),
      ),
    });
    if (!intent) throw new Error("Intent not found");
    contextTitle = intent.title;
    inputRefs = [intent.id];
  } else if (input.requirementId) {
    const req = await db.query.requirements.findFirst({
      where: and(
        eq(requirements.id, input.requirementId),
        eq(requirements.workspaceId, input.workspaceId),
      ),
    });
    if (!req) throw new Error("Requirement not found");
    contextTitle = req.title;
    inputRefs = [req.id];
  } else {
    throw new Error("intentId or requirementId required");
  }

  return runDraftWithFallback({
    workspaceId: input.workspaceId,
    config,
    inputRefs,
    entityType: "intent",
    createdById: input.createdById,
    userPrompt: `Suggest negative-path test intents (failure / edge cases) related to: ${contextTitle}. Propose create intents only.`,
    heuristic: () => {
      const key = slugKey("NEG", contextTitle);
      const diffs: ProposalDiff[] = [
        {
          entityType: "intent",
          action: "create",
          before: null,
          after: {
            key,
            title: `Negative path: ${contextTitle}`,
            behavior: `Exercise failure or boundary conditions for: ${contextTitle}`,
            status: "draft",
          },
        },
      ];
      if (anchorIntentId) {
        diffs.push({
          entityType: "edge",
          action: "link",
          before: null,
          after: {
            fromType: "intent",
            fromKey: key,
            toType: "intent",
            toId: anchorIntentId,
            relation: "part_of",
          },
        });
      }
      return {
        rationale: `Heuristic negative-path intent for ${contextTitle}`,
        diffs,
      };
    },
  });
}

export async function suggestRequirementIntentLinks(input: {
  workspaceId: string;
  createdById?: string | null;
  config?: AiProviderConfig;
  allowHeuristic?: boolean;
}): Promise<DraftJobResult> {
  const config =
    input.config ?? (await getWorkspaceAiProviderConfig(input.workspaceId));
  if (!isAiProviderEnabled(config) && !input.allowHeuristic) {
    return { disabled: true };
  }

  const [reqs, intents, edges] = await Promise.all([
    db.query.requirements.findMany({
      where: eq(requirements.workspaceId, input.workspaceId),
      limit: 50,
    }),
    db.query.testIntents.findMany({
      where: eq(testIntents.workspaceId, input.workspaceId),
      limit: 50,
    }),
    db.query.qualityEdges.findMany({
      where: and(
        eq(qualityEdges.workspaceId, input.workspaceId),
        eq(qualityEdges.relation, "covers"),
      ),
      limit: 200,
    }),
  ]);

  const coveredReq = new Set(
    edges
      .filter((e) => e.toType === "requirement")
      .map((e) => e.toId),
  );
  const uncovered = reqs.filter((r) => !coveredReq.has(r.id));

  return runDraftWithFallback({
    workspaceId: input.workspaceId,
    config,
    inputRefs: uncovered.slice(0, 5).map((r) => r.id),
    entityType: "edge",
    createdById: input.createdById,
    userPrompt: `Given requirements ${JSON.stringify(reqs.map((r) => ({ id: r.id, key: r.key, title: r.title })))} and intents ${JSON.stringify(intents.map((i) => ({ id: i.id, key: i.key, title: i.title })))}, propose covers links for gaps.`,
    heuristic: () => {
      const diffs: ProposalDiff[] = [];
      const firstReq = uncovered[0] ?? reqs[0];
      const firstIntent = intents[0];
      if (firstReq && firstIntent) {
        diffs.push({
          entityType: "edge",
          action: "link",
          before: null,
          after: {
            fromType: "intent",
            fromId: firstIntent.id,
            toType: "requirement",
            toId: firstReq.id,
            relation: "covers",
          },
        });
      } else {
        const key = slugKey("INT", "coverage-gap");
        diffs.push({
          entityType: "intent",
          action: "create",
          before: null,
          after: {
            key,
            title: "Coverage gap placeholder",
            behavior: "Add intents and requirements, then re-run link suggestions.",
            status: "draft",
          },
        });
      }
      return {
        rationale:
          firstReq && firstIntent
            ? `Heuristic link: ${firstIntent.key} covers ${firstReq.key}`
            : "Heuristic placeholder intent (add graph data for links)",
        diffs,
      };
    },
  });
}

/** Pure helper for tests — builds heuristic intent payload from requirement title. */
export function heuristicIntentFromRequirementTitle(
  reqKey: string,
  title: string,
  requirementId: string,
): ProposalPayload {
  const key = slugKey("INT", title);
  return {
    rationale: `Heuristic draft intent for requirement ${reqKey}`,
    diffs: [
      {
        entityType: "intent",
        action: "create",
        before: null,
        after: {
          key,
          title: `Verify: ${title}`,
          behavior: title,
          status: "draft",
        },
      },
      {
        entityType: "edge",
        action: "link",
        before: null,
        after: {
          fromType: "intent",
          fromKey: key,
          toType: "requirement",
          toId: requirementId,
          relation: "covers",
        },
      },
    ],
  };
}

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** Exported for tests — find near-duplicate intent pairs by normalized title. */
export function findDuplicateIntentPairs(
  intents: Array<{ id: string; key: string; title: string }>,
): Array<[typeof intents[number], typeof intents[number]]> {
  const pairs: Array<[typeof intents[number], typeof intents[number]]> = [];
  const byNorm = new Map<string, typeof intents>();
  for (const intent of intents) {
    const norm = normalizeTitle(intent.title);
    if (!norm) continue;
    const bucket = byNorm.get(norm) ?? [];
    for (const other of bucket) {
      pairs.push([other, intent]);
    }
    bucket.push(intent);
    byNorm.set(norm, bucket);
  }
  return pairs;
}

export async function suggestDuplicateIntents(input: {
  workspaceId: string;
  createdById?: string | null;
  config?: AiProviderConfig;
  allowHeuristic?: boolean;
}): Promise<DraftJobResult> {
  const config =
    input.config ?? (await getWorkspaceAiProviderConfig(input.workspaceId));
  if (!isAiProviderEnabled(config) && !input.allowHeuristic) {
    return { disabled: true };
  }

  const intents = await db.query.testIntents.findMany({
    where: eq(testIntents.workspaceId, input.workspaceId),
    limit: 100,
  });
  const pairs = findDuplicateIntentPairs(
    intents.map((i) => ({ id: i.id, key: i.key, title: i.title })),
  );

  return runDraftWithFallback({
    workspaceId: input.workspaceId,
    config,
    inputRefs: pairs.flatMap(([a, b]) => [a.id, b.id]).slice(0, 6),
    entityType: "intent",
    createdById: input.createdById,
    userPrompt: `Find duplicate test intents among ${JSON.stringify(
      intents.map((i) => ({ id: i.id, key: i.key, title: i.title })),
    )}. Propose update diffs to deprecate or merge duplicates (do not invent new intents).`,
    heuristic: () => {
      const pair = pairs[0];
      if (!pair) {
        return {
          rationale: "No near-duplicate intents found by title similarity.",
          diffs: [],
        };
      }
      const [keep, dup] = pair;
      return {
        rationale: `Possible duplicate: ${dup.key} (“${dup.title}”) matches ${keep.key}. Consider deprecating the duplicate.`,
        diffs: [
          {
            entityType: "intent",
            action: "update",
            entityId: dup.id,
            before: { status: "ready", key: dup.key, title: dup.title },
            after: {
              status: "deprecated",
              key: dup.key,
              title: dup.title,
              note: `Possible duplicate of ${keep.key}`,
            },
          },
        ],
      };
    },
  });
}

export async function explainChangeImpact(input: {
  workspaceId: string;
  paths?: string[];
  commitSha?: string;
  pr?: number;
  createdById?: string | null;
  config?: AiProviderConfig;
  allowHeuristic?: boolean;
}): Promise<DraftJobResult> {
  const config =
    input.config ?? (await getWorkspaceAiProviderConfig(input.workspaceId));
  if (!isAiProviderEnabled(config) && !input.allowHeuristic) {
    return { disabled: true };
  }

  const { resolveAffectedPaths } = await import("@/lib/affected-resolve");
  const { getWorkspaceImpact } = await import("@/lib/quality-graph");

  const resolved = await resolveAffectedPaths(input.workspaceId, {
    paths: input.paths,
    commitSha: input.commitSha,
    pr: input.pr,
  });
  if (!resolved.ok) {
    throw new Error(resolved.error);
  }

  const { impact } = await getWorkspaceImpact(
    input.workspaceId,
    resolved.paths,
  );

  const intentKeys = impact.intents
    .slice(0, 12)
    .map((i) => i.key)
    .join(", ");
  const componentKeys = impact.components
    .slice(0, 8)
    .map((c) => c.key)
    .join(", ");
  const gapText = impact.gaps
    .slice(0, 5)
    .map((g) => `${g.kind}:${g.key}`)
    .join("; ");
  const summary = [
    `Change impact (${resolved.pathsSource}): ${resolved.paths.length} path(s).`,
    componentKeys
      ? `Components: ${componentKeys}.`
      : "No mapped components for these paths.",
    intentKeys
      ? `Affected intents: ${intentKeys}.`
      : "No intents linked via quality edges.",
    gapText
      ? `Gaps: ${gapText}.`
      : "No coverage gaps flagged for this change.",
  ].join(" ");

  return runDraftWithFallback({
    workspaceId: input.workspaceId,
    config,
    inputRefs: [
      ...impact.intents.slice(0, 5).map((i) => i.id),
      ...resolved.paths.slice(0, 3),
    ],
    entityType: "intent",
    createdById: input.createdById,
    userPrompt: `Explain this deterministic change-impact report in 2-4 sentences for a human reviewer. Do not invent new graph edges. Report JSON: ${JSON.stringify({ paths: resolved.paths, impact })}`,
    heuristic: () => ({
      rationale: summary,
      diffs: [],
    }),
  });
}

export type DraftedCaseStep = {
  action: string;
  expected: string;
  data: string;
};

export type CaseStepsDraftResult =
  | { disabled: true }
  | {
      disabled?: false;
      steps: DraftedCaseStep[];
      heuristic: boolean;
      model: string;
    };

export type TriageSummaryDraftResult =
  | { disabled: true }
  | {
      disabled?: false;
      summary: string;
      heuristic: boolean;
      model: string;
    };

const CASE_STEPS_SYSTEM = `You are a QA test-case author for Topology.
Respond with JSON only (no markdown fences): { "steps": [{ "action": string, "expected": string, "data": string }] }.
Produce 3-6 concrete, ordered manual test steps. Keep action/expected concise.`;

const TRIAGE_SUMMARY_SYSTEM = `You are a QA triage assistant for Topology.
Respond with JSON only (no markdown fences): { "summary": string }.
Summarize the failure cluster for a human reviewer in 2-4 sentences.`;

function parseJsonObject(raw: string): unknown | null {
  const trimmed = raw.trim();
  const jsonText = trimmed.startsWith("{")
    ? trimmed
    : trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}

/** Heuristic step draft used when the model is offline. */
export function heuristicCaseSteps(input: {
  title: string;
  description?: string | null;
}): DraftedCaseStep[] {
  const title = input.title.trim() || "the behavior under test";
  const detail = input.description?.trim();
  return [
    {
      action: `Open the surface related to: ${title}`,
      expected: "The page or screen loads without errors",
      data: "",
    },
    {
      action: detail
        ? `Follow the described flow: ${detail.slice(0, 180)}`
        : `Perform the primary action for ${title}`,
      expected: "The system accepts valid input and progresses",
      data: "",
    },
    {
      action: `Verify the outcome of ${title}`,
      expected: "Observed result matches the acceptance criteria",
      data: "",
    },
  ];
}

function parseCaseStepsPayload(raw: string): DraftedCaseStep[] | null {
  const parsed = parseJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const steps = (parsed as { steps?: unknown }).steps;
  if (!Array.isArray(steps) || steps.length === 0) return null;
  const mapped = steps
    .map((step) => {
      if (!step || typeof step !== "object") return null;
      const action = String((step as { action?: unknown }).action ?? "").trim();
      if (!action) return null;
      return {
        action,
        expected: String((step as { expected?: unknown }).expected ?? "").trim(),
        data: String((step as { data?: unknown }).data ?? "").trim(),
      };
    })
    .filter((step): step is DraftedCaseStep => Boolean(step));
  return mapped.length > 0 ? mapped : null;
}

export async function draftCaseSteps(input: {
  workspaceId: string;
  title: string;
  description?: string | null;
  requirementId?: string | null;
  config?: AiProviderConfig;
  allowHeuristic?: boolean;
}): Promise<CaseStepsDraftResult> {
  const config =
    input.config ?? (await getWorkspaceAiProviderConfig(input.workspaceId));
  if (!isAiProviderEnabled(config) && !input.allowHeuristic) {
    return { disabled: true };
  }

  let requirementContext = "";
  if (input.requirementId) {
    const req = await db.query.requirements.findFirst({
      where: and(
        eq(requirements.id, input.requirementId),
        eq(requirements.workspaceId, input.workspaceId),
      ),
    });
    if (req) {
      requirementContext = ` Requirement ${req.key}: ${req.title}. ${req.description}`;
    }
  }

  let steps: DraftedCaseStep[] | null = null;
  let modelLabel = "heuristic";
  let heuristic = true;

  if (isAiProviderEnabled(config)) {
    try {
      const chat = await completeChat({
        system: CASE_STEPS_SYSTEM,
        user: `Draft manual test steps for case titled "${input.title}". Description: ${input.description ?? ""}.${requirementContext}`,
        config,
      });
      if (chat?.content) {
        steps = parseCaseStepsPayload(chat.content);
        if (steps) {
          modelLabel = chat.model;
          heuristic = false;
        }
      }
    } catch {
      steps = null;
    }
  }

  if (!steps) {
    steps = heuristicCaseSteps({
      title: input.title,
      description: input.description,
    });
    modelLabel = "heuristic";
    heuristic = true;
  }

  return { steps, heuristic, model: modelLabel };
}

/** Heuristic triage summary used when the model is offline. */
export function heuristicTriageSummary(input: {
  items: Array<{
    caseKey?: string | null;
    caseTitle?: string | null;
    notes?: string | null;
    priority?: string | null;
    reason?: string | null;
  }>;
}): string {
  const count = input.items.length;
  const keys = Array.from(
    new Set(
      input.items
        .map((item) => item.caseKey?.trim())
        .filter((key): key is string => Boolean(key)),
    ),
  ).slice(0, 5);
  const top = input.items[0];
  const note = top?.notes?.trim().split("\n")[0]?.trim();
  const reason = top?.reason?.trim();
  const parts = [
    `Cluster of ${count} failure${count === 1 ? "" : "s"}`,
    keys.length > 0 ? `touching ${keys.join(", ")}` : null,
    top?.priority ? `(highest priority ${top.priority})` : null,
  ].filter(Boolean);
  const lead = `${parts.join(" ")}.`;
  const detail = note || reason || top?.caseTitle || "No failure notes provided.";
  return `${lead} Representative signal: ${detail}`;
}

function parseTriageSummaryPayload(raw: string): string | null {
  const parsed = parseJsonObject(raw);
  if (!parsed || typeof parsed !== "object") return null;
  const summary = (parsed as { summary?: unknown }).summary;
  return typeof summary === "string" && summary.trim() ? summary.trim() : null;
}

export async function draftTriageSummary(input: {
  workspaceId: string;
  items: Array<{
    caseKey?: string | null;
    caseTitle?: string | null;
    notes?: string | null;
    priority?: string | null;
    reason?: string | null;
  }>;
  config?: AiProviderConfig;
  allowHeuristic?: boolean;
}): Promise<TriageSummaryDraftResult> {
  const config =
    input.config ?? (await getWorkspaceAiProviderConfig(input.workspaceId));
  if (!isAiProviderEnabled(config) && !input.allowHeuristic) {
    return { disabled: true };
  }

  let summary: string | null = null;
  let modelLabel = "heuristic";
  let heuristic = true;

  if (isAiProviderEnabled(config)) {
    try {
      const chat = await completeChat({
        system: TRIAGE_SUMMARY_SYSTEM,
        user: `Summarize this failure cluster: ${JSON.stringify(input.items.slice(0, 12))}`,
        config,
      });
      if (chat?.content) {
        summary = parseTriageSummaryPayload(chat.content);
        if (summary) {
          modelLabel = chat.model;
          heuristic = false;
        }
      }
    } catch {
      summary = null;
    }
  }

  if (!summary) {
    summary = heuristicTriageSummary({ items: input.items });
    modelLabel = "heuristic";
    heuristic = true;
  }

  return { summary, heuristic, model: modelLabel };
}

