import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const jiraIdSchema = z.string().regex(/^\d{1,32}$/);
const originSchema = z.string().url().refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && value === url.origin;
});
const targetSchema = z.object({
  workspaceId: z.string().uuid(),
  origin: originSchema,
  projectId: jiraIdSchema,
  secretEnv: z.string().regex(/^TOPOLOGY_JIRA_REQUIREMENT_SECRET_[A-Z0-9_]+$/),
});

export function jiraRequirementTarget(workspaceId: string, env = process.env) {
  const raw = env.TOPOLOGY_JIRA_REQUIREMENT_TARGETS;
  if (!raw) return null;

  try {
    const parsed = z.array(targetSchema).max(500).safeParse(JSON.parse(raw));
    if (!parsed.success) return null;
    const targets = parsed.data;
    const matches = targets.filter((row) => row.workspaceId === workspaceId);
    if (matches.length !== 1) return null;
    const target = matches[0];
    const secret = env[target.secretEnv];
    if (!secret || Buffer.byteLength(secret) < 32) return null;
    if (targets.some((other) => other !== target && env[other.secretEnv] === secret)) return null;
    return { ...target, secret };
  } catch {
    return null;
  }
}

export const maxJiraWebhookBytes = 1024 * 1024;

export async function readJiraWebhookBody(request: Request) {
  if (Number(request.headers.get("content-length")) > maxJiraWebhookBytes) return null;
  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks, total);
      total += value.byteLength;
      if (total > maxJiraWebhookBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
}

export function validJiraRequirementSignature(body: Uint8Array, signature: string, secret: string) {
  const match = /^sha256=([a-f\d]{64})$/i.exec(signature);
  if (!match) return false;
  const digest = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(digest, Buffer.from(match[1], "hex"));
}

const eventTypeSchema = z.object({ webhookEvent: z.string() });
const payloadSchema = z.object({
  issue: z.object({
    id: jiraIdSchema,
    key: z.string().regex(/^[A-Z][A-Z0-9_]{0,60}-\d{1,32}$/),
    self: z.string().url(),
    fields: z.object({
      project: z.object({ id: jiraIdSchema }),
      updated: z.string().max(40).refine((date) => Number.isFinite(Date.parse(date))),
      summary: z.string().min(1).max(240),
      description: z.union([
        z.string().max(100_000),
        z.object({ type: z.literal("doc"), version: z.literal(1), content: z.array(z.unknown()) }).passthrough(),
        z.null(),
      ]),
    }),
  }),
});

function plainDescription(value: unknown, depth = 0): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object" || depth > 64) return "";
  const node = value as { text?: unknown; type?: unknown; content?: unknown };
  if (node.type === "hardBreak") return "\n";
  if (node.type === "text" && typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  const parts = node.content.map((child: unknown) => plainDescription(child, depth + 1));
  return parts.join(node.type === "paragraph" || node.type === "heading" ? "" : "\n");
}

export type JiraRequirementUpdate = {
  issueId: string;
  issueKey: string;
  updatedAt: Date;
  title: string;
  description: string;
  sourceDescription: unknown;
  contentHash: string;
};

export function parseJiraRequirementEvent(payload: unknown, target: { origin: string; projectId: string }): {
  status: "ignored" | "invalid" | "unmatched";
} | { status: "update"; event: JiraRequirementUpdate } {
  const kind = eventTypeSchema.safeParse(payload);
  if (!kind.success) return { status: "invalid" };
  if (kind.data.webhookEvent !== "jira:issue_updated" && kind.data.webhookEvent !== "jira:issue_created") {
    return { status: "ignored" };
  }

  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) return { status: "invalid" };
  const { issue } = parsed.data;
  const { description: sourceDescription, summary: title, project, updated } = issue.fields;
  if (new URL(issue.self).origin !== target.origin || project.id !== target.projectId) return { status: "unmatched" };
  const description = plainDescription(sourceDescription).trim();
  if (description.length > 100_000) return { status: "invalid" };
  return { status: "update", event: {
    issueId: issue.id, issueKey: issue.key, updatedAt: new Date(updated),
    title, description, sourceDescription,
    contentHash: createHash("sha256").update(JSON.stringify([title, description])).digest("hex"),
  } };
}
