import { createHmac, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { runs, webhookEndpoints } from "@/db/schema";

export type WebhookEvent =
  | "run.completed"
  | "issue.created"
  | "intent.stale"
  | "coverage.dropped"
  | "proposal.created";

/** Documented outbound event names (subscribe via endpoint `events` CSV). */
export const WEBHOOK_EVENTS: readonly WebhookEvent[] = [
  "run.completed",
  "issue.created",
  "intent.stale",
  "coverage.dropped",
  "proposal.created",
] as const;

export type WebhookPayload = {
  id: string;
  event: WebhookEvent;
  createdAt: string;
  data: Record<string, unknown>;
};

function parseEvents(raw: string): Set<string> {
  return new Set(
    raw
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  );
}

function signBody(secret: string, body: string): string | null {
  if (!secret) return null;
  return createHmac("sha256", secret).update(body).digest("hex");
}

function ipv4ToParts(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const nums = parts.map((part) => {
    if (!/^\d{1,3}$/.test(part)) return Number.NaN;
    return Number(part);
  });
  if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return nums;
}

function isBlockedIpv4(parts: number[]) {
  const [a, b] = parts;
  if (a === 0 || a === 127) return true;
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function ipv4FromMapped(host: string): string | null {
  const prefix = "::ffff:";
  if (!host.startsWith(prefix)) return null;
  const rest = host.slice(prefix.length);
  if (ipv4ToParts(rest)) return rest;
  const halves = rest.split(":");
  if (halves.length !== 2) return null;
  const hi = Number.parseInt(halves[0], 16);
  const lo = Number.parseInt(halves[1], 16);
  if (!Number.isInteger(hi) || !Number.isInteger(lo) || hi > 0xffff || lo > 0xffff) {
    return null;
  }
  return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
}

function isBlockedIpv6(host: string) {
  if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
  const mapped = ipv4FromMapped(host);
  if (mapped) {
    const parts = ipv4ToParts(mapped);
    return parts ? isBlockedIpv4(parts) : false;
  }
  const first = Number.parseInt(host.split(":")[0] || "0", 16);
  if (!Number.isInteger(first)) return false;
  if (first >= 0xfe80 && first <= 0xfebf) return true;
  if ((first & 0xfe00) === 0xfc00) return true;
  return false;
}

/** Reject non-http(s) and link-local/loopback/private webhook targets. */
export function webhookUrlError(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return "Webhook URL must be a valid http or https URL";
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return "Webhook URL must use http or https";
  }
  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (!host || host === "localhost" || host.endsWith(".localhost")) {
    return "Webhook URL must not target a local or private address";
  }
  const ipv4 = ipv4ToParts(host);
  if (ipv4 && isBlockedIpv4(ipv4)) {
    return "Webhook URL must not target a local or private address";
  }
  if (host.includes(":") && isBlockedIpv6(host)) {
    return "Webhook URL must not target a local or private address";
  }
  return null;
}

async function deliverToEndpoint(
  endpoint: {
    id: string;
    url: string;
    secret: string;
  },
  payload: WebhookPayload,
  persist = true,
): Promise<{ ok: boolean; status: number | null }> {
  const body = JSON.stringify(payload);
  const signature = signBody(endpoint.secret, body);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": "Topology-Webhooks/1.0",
    "X-Topology-Event": payload.event,
    "X-Topology-Delivery": payload.id,
  };
  if (signature) {
    headers["X-Topology-Signature"] = `sha256=${signature}`;
  }

  if (webhookUrlError(endpoint.url)) {
    return { ok: false, status: null };
  }

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
    });
    if (persist && endpoint.id !== "env") {
      await db
        .update(webhookEndpoints)
        .set({
          lastDeliveredAt: new Date(),
          lastStatus: res.status,
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, endpoint.id));
    }
    return { ok: res.ok, status: res.status };
  } catch {
    if (persist && endpoint.id !== "env") {
      await db
        .update(webhookEndpoints)
        .set({
          lastDeliveredAt: new Date(),
          lastStatus: 0,
          updatedAt: new Date(),
        })
        .where(eq(webhookEndpoints.id, endpoint.id));
    }
    return { ok: false, status: null };
  }
}

/**
 * Fire-and-forget dispatch to all enabled endpoints subscribed to `event`.
 * Also honors TOPOLOGY_WEBHOOK_URL env fallback (all events).
 */
export async function dispatchWebhook(
  event: WebhookEvent,
  data: Record<string, unknown>,
  workspaceId?: string | null,
): Promise<WebhookPayload> {
  const payload: WebhookPayload = {
    id: randomUUID(),
    event,
    createdAt: new Date().toISOString(),
    data,
  };

  const endpoints = await db.query.webhookEndpoints.findMany({
    where: workspaceId
      ? and(
          eq(webhookEndpoints.enabled, 1),
          eq(webhookEndpoints.workspaceId, workspaceId),
        )
      : eq(webhookEndpoints.enabled, 1),
  });

  const deliveries: Promise<unknown>[] = [];

  for (const endpoint of endpoints) {
    if (!parseEvents(endpoint.events).has(event)) continue;
    deliveries.push(deliverToEndpoint(endpoint, payload));
  }

  const envUrl = process.env.TOPOLOGY_WEBHOOK_URL?.trim();
  if (envUrl) {
    deliveries.push(
      deliverToEndpoint(
        {
          id: "env",
          url: envUrl,
          secret: process.env.TOPOLOGY_WEBHOOK_SECRET ?? "",
        },
        payload,
        false,
      ),
    );
  }

  void Promise.allSettled(deliveries);
  return payload;
}

export async function buildRunCompletedPayload(runId: string) {
  const run = await db.query.runs.findFirst({
    where: eq(runs.id, runId),
    with: { results: true },
  });
  if (!run) return null;

  const passed = run.results.filter((r) => r.status === "passed").length;
  const failed = run.results.filter((r) => r.status === "failed").length;
  const blocked = run.results.filter((r) => r.status === "blocked").length;
  const skipped = run.results.filter((r) => r.status === "skipped").length;
  const untested = run.results.filter((r) => r.status === "untested").length;

  return {
    run: {
      id: run.id,
      name: run.name,
      kind: run.kind,
      status: run.status,
      source: run.source,
      branch: run.branch,
      commitSha: run.commitSha,
      completedAt: run.completedAt?.toISOString() ?? null,
    },
    summary: {
      total: run.results.length,
      passed,
      failed,
      blocked,
      skipped,
      untested,
    },
  };
}
