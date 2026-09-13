import { createHmac, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { runs, webhookEndpoints } from "@/db/schema";

export type WebhookEvent = "run.completed" | "issue.created";

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

  try {
    const res = await fetch(endpoint.url, {
      method: "POST",
      headers,
      body,
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
