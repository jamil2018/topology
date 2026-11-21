import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { db } from "@/db";
import { assertLinkedIssueProvider, linkedIssues } from "@/db/schema";
import { CI_PROJECT_HEADER } from "@/lib/ci-auth";
import { emitLive } from "@/lib/live";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const INBOUND_ISSUE_PROVIDERS = [
  "github",
  "gitlab",
  "jira",
  "linear",
] as const;

export type InboundIssueProvider = (typeof INBOUND_ISSUE_PROVIDERS)[number];

export function isInboundIssueProvider(
  value: string,
): value is InboundIssueProvider {
  return (INBOUND_ISSUE_PROVIDERS as readonly string[]).includes(value);
}

/** Env keys checked for HMAC / shared-secret verification (provider-specific first). */
export const INBOUND_ISSUE_SECRET_ENV: Record<
  InboundIssueProvider,
  readonly string[]
> = {
  github: ["TOPOLOGY_GITHUB_WEBHOOK_SECRET", "TOPOLOGY_ISSUE_WEBHOOK_SECRET"],
  gitlab: ["TOPOLOGY_GITLAB_WEBHOOK_SECRET", "TOPOLOGY_ISSUE_WEBHOOK_SECRET"],
  jira: ["TOPOLOGY_JIRA_WEBHOOK_SECRET", "TOPOLOGY_ISSUE_WEBHOOK_SECRET"],
  linear: ["TOPOLOGY_LINEAR_WEBHOOK_SECRET", "TOPOLOGY_ISSUE_WEBHOOK_SECRET"],
};

export type InboundIssueSigningRow = {
  provider: InboundIssueProvider;
  path: string;
  signingConfigured: boolean;
  secretEnvKeys: readonly string[];
};

/** Whether each inbound issue provider has a signing secret configured in env. */
export function inboundIssueSigningStatus(
  env: NodeJS.ProcessEnv = process.env,
): InboundIssueSigningRow[] {
  return INBOUND_ISSUE_PROVIDERS.map((provider) => {
    const secretEnvKeys = INBOUND_ISSUE_SECRET_ENV[provider];
    const signingConfigured = secretEnvKeys.some(
      (key) => Boolean(env[key]?.trim()),
    );
    return {
      provider,
      path: `/api/webhooks/issues/${provider}`,
      signingConfigured,
      secretEnvKeys,
    };
  });
}

export function resolveInboundWorkspaceId(request: Request): string | null {
  const { searchParams } = new URL(request.url);
  const fromQuery = searchParams.get("workspaceId")?.trim();
  if (fromQuery && UUID_RE.test(fromQuery)) return fromQuery;
  const fromHeader = request.headers.get(CI_PROJECT_HEADER)?.trim();
  if (fromHeader && UUID_RE.test(fromHeader)) return fromHeader;
  return null;
}

function envSecret(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function safeEqualHex(expectedHex: string, provided: string): boolean {
  try {
    const a = Buffer.from(expectedHex, "hex");
    const b = Buffer.from(provided, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

function safeEqualUtf8(expected: string, provided: string): boolean {
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(provided, "utf8");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyInboundIssueWebhook(input: {
  provider: InboundIssueProvider;
  rawBody: string;
  headers: Headers;
}): { ok: true } | { ok: false; status: number; error: string } {
  if (input.provider === "github") {
    const secret = envSecret(
      "TOPOLOGY_GITHUB_WEBHOOK_SECRET",
      "TOPOLOGY_ISSUE_WEBHOOK_SECRET",
    );
    if (!secret) {
      return { ok: false, status: 401, error: "Webhook secret is not configured" };
    }
    const signature = input.headers.get("x-hub-signature-256");
    if (!signature?.startsWith("sha256=")) {
      return { ok: false, status: 401, error: "Missing X-Hub-Signature-256" };
    }
    const expected = createHmac("sha256", secret)
      .update(input.rawBody, "utf8")
      .digest("hex");
    if (!safeEqualHex(expected, signature.slice("sha256=".length))) {
      return { ok: false, status: 401, error: "Invalid webhook signature" };
    }
    return { ok: true };
  }

  if (input.provider === "gitlab") {
    const secret = envSecret(
      "TOPOLOGY_GITLAB_WEBHOOK_SECRET",
      "TOPOLOGY_ISSUE_WEBHOOK_SECRET",
    );
    if (!secret) {
      return { ok: false, status: 401, error: "Webhook secret is not configured" };
    }
    const token = input.headers.get("x-gitlab-token");
    if (!token || !safeEqualUtf8(secret, token)) {
      return { ok: false, status: 401, error: "Invalid GitLab webhook token" };
    }
    return { ok: true };
  }

  if (input.provider === "jira") {
    const secret = envSecret(
      "TOPOLOGY_JIRA_WEBHOOK_SECRET",
      "TOPOLOGY_ISSUE_WEBHOOK_SECRET",
    );
    if (!secret) {
      return { ok: false, status: 401, error: "Webhook secret is not configured" };
    }
    const token =
      input.headers.get("x-topology-webhook-token") ??
      input.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
      "";
    if (!token || !safeEqualUtf8(secret, token)) {
      return { ok: false, status: 401, error: "Invalid Jira webhook token" };
    }
    return { ok: true };
  }

  const secret = envSecret(
    "TOPOLOGY_LINEAR_WEBHOOK_SECRET",
    "TOPOLOGY_ISSUE_WEBHOOK_SECRET",
  );
  if (!secret) {
    return { ok: false, status: 401, error: "Webhook secret is not configured" };
  }
  const signature = input.headers.get("linear-signature");
  if (!signature) {
    return { ok: false, status: 401, error: "Missing Linear-Signature" };
  }
  const expected = createHmac("sha256", secret)
    .update(input.rawBody, "utf8")
    .digest("hex");
  if (!safeEqualHex(expected, signature) && !safeEqualUtf8(expected, signature)) {
    return { ok: false, status: 401, error: "Invalid Linear webhook signature" };
  }
  return { ok: true };
}

export type ParsedInboundIssueEvent = {
  remoteId: string;
  remoteKey?: string | null;
  remoteStatus: "open" | "in_progress" | "done" | "unknown";
  title?: string | null;
  url?: string | null;
  skipped?: boolean;
  reason?: string;
};

function mapClosedFlag(closed: boolean): "open" | "done" {
  return closed ? "done" : "open";
}

export function parseInboundIssuePayload(
  provider: InboundIssueProvider,
  payload: unknown,
  headers: Headers,
): ParsedInboundIssueEvent | null {
  if (!payload || typeof payload !== "object") return null;

  if (provider === "github") {
    const event = headers.get("x-github-event") ?? "";
    if (event && event !== "issues" && event !== "issue") {
      return { remoteId: "", remoteStatus: "unknown", skipped: true, reason: event };
    }
    const action = String((payload as { action?: unknown }).action ?? "");
    const issue = (payload as { issue?: Record<string, unknown> }).issue;
    if (!issue || typeof issue !== "object") return null;
    const id = issue.id != null ? String(issue.id) : "";
    const number = issue.number != null ? String(issue.number) : "";
    if (!id && !number) return null;
    const state = String(issue.state ?? "").toLowerCase();
    const closed =
      action === "closed" || state === "closed" || Boolean(issue.closed_at);
    return {
      remoteId: id || number,
      remoteKey: number ? `#${number}` : id,
      remoteStatus: mapClosedFlag(closed),
      title: typeof issue.title === "string" ? issue.title : null,
      url: typeof issue.html_url === "string" ? issue.html_url : null,
    };
  }

  if (provider === "gitlab") {
    const event =
      headers.get("x-gitlab-event") ??
      String((payload as { object_kind?: unknown }).object_kind ?? "");
    if (
      event &&
      !/issue/i.test(event) &&
      (payload as { object_kind?: string }).object_kind !== "issue"
    ) {
      return { remoteId: "", remoteStatus: "unknown", skipped: true, reason: event };
    }
    const attrsRaw =
      (payload as { object_attributes?: unknown }).object_attributes ?? payload;
    if (!attrsRaw || typeof attrsRaw !== "object") return null;
    const attrs = attrsRaw as Record<string, unknown>;
    const id = attrs.id != null ? String(attrs.id) : "";
    const iid = attrs.iid != null ? String(attrs.iid) : "";
    if (!id && !iid) return null;
    const state = String(attrs.state ?? "").toLowerCase();
    const closed = state === "closed";
    return {
      remoteId: id || iid,
      remoteKey: iid || id,
      remoteStatus: mapClosedFlag(closed),
      title: typeof attrs.title === "string" ? attrs.title : null,
      url: typeof attrs.url === "string" ? attrs.url : null,
    };
  }

  if (provider === "jira") {
    const issue = (payload as { issue?: Record<string, unknown> }).issue;
    if (!issue || typeof issue !== "object") return null;
    const key = typeof issue.key === "string" ? issue.key : "";
    const id = issue.id != null ? String(issue.id) : "";
    if (!key && !id) return null;
    const fields = (issue.fields ?? {}) as Record<string, unknown>;
    const statusName = String(
      (fields.status as { name?: string } | undefined)?.name ?? "",
    ).toLowerCase();
    const category = String(
      (fields.status as { statusCategory?: { key?: string } } | undefined)
        ?.statusCategory?.key ?? "",
    ).toLowerCase();
    const closed =
      category === "done" ||
      statusName === "done" ||
      statusName === "closed" ||
      statusName === "resolved";
    return {
      remoteId: id || key,
      remoteKey: key || id,
      remoteStatus: mapClosedFlag(closed),
      title: typeof fields.summary === "string" ? fields.summary : null,
      url: null,
    };
  }

  // Linear
  const dataRaw = (payload as { data?: unknown }).data ?? payload;
  if (!dataRaw || typeof dataRaw !== "object") return null;
  const data = dataRaw as Record<string, unknown>;
  const id = data.id != null ? String(data.id) : "";
  const identifier =
    typeof data.identifier === "string" ? data.identifier : "";
  if (!id && !identifier) return null;
  const state =
    (data.state as { type?: string; name?: string } | undefined) ??
    undefined;
  const stateType = String(state?.type ?? "").toLowerCase();
  const stateName = String(state?.name ?? data.state ?? "").toLowerCase();
  const closed =
    stateType === "completed" ||
    stateType === "canceled" ||
    stateName === "done" ||
    stateName === "completed" ||
    stateName === "cancelled" ||
    stateName === "canceled" ||
    Boolean(data.completedAt);
  return {
    remoteId: id || identifier,
    remoteKey: identifier || id,
    remoteStatus: mapClosedFlag(closed),
    title: typeof data.title === "string" ? data.title : null,
    url: typeof data.url === "string" ? data.url : null,
  };
}

export async function applyInboundIssueSync(input: {
  workspaceId: string;
  provider: InboundIssueProvider;
  event: ParsedInboundIssueEvent;
}) {
  if (input.event.skipped || !input.event.remoteId) {
    return { updated: 0, needsRetest: 0, skipped: true as const };
  }

  const provider = assertLinkedIssueProvider(input.provider);
  const idMatch = eq(linkedIssues.remoteId, input.event.remoteId);
  const keyMatch = input.event.remoteKey
    ? eq(linkedIssues.remoteKey, input.event.remoteKey)
    : null;

  const rows = await db.query.linkedIssues.findMany({
    where: and(
      eq(linkedIssues.workspaceId, input.workspaceId),
      eq(linkedIssues.provider, provider),
      keyMatch ? or(idMatch, keyMatch) : idMatch,
    ),
  });

  if (rows.length === 0) {
    return { updated: 0, needsRetest: 0, skipped: false as const };
  }

  let updated = 0;
  let needsRetest = 0;
  const now = new Date();

  for (const row of rows) {
    const closedNow =
      row.remoteStatus !== "done" && input.event.remoteStatus === "done";
    const nextNeedsRetest = closedNow ? 1 : row.needsRetest;
    const [next] = await db
      .update(linkedIssues)
      .set({
        remoteStatus: input.event.remoteStatus,
        needsRetest: nextNeedsRetest,
        ...(input.event.title ? { title: input.event.title } : {}),
        ...(input.event.url ? { url: input.event.url } : {}),
        lastSyncedAt: now,
        updatedAt: now,
      })
      .where(eq(linkedIssues.id, row.id))
      .returning();
    if (next) {
      updated += 1;
      if (closedNow) {
        needsRetest += 1;
        emitLive({
          workspaceId: input.workspaceId,
          topic: "triage",
          entityId: next.id,
          status: "retest",
        });
      }
    }
  }

  return { updated, needsRetest, skipped: false as const };
}
