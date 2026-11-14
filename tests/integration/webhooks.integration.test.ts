import { createHmac } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

const hasDb = Boolean(process.env.DATABASE_URL);

type FetchCall = [input: RequestInfo | URL, init?: RequestInit];

function callsTo(fetchImpl: { mock: { calls: FetchCall[] } }, url: string) {
  return fetchImpl.mock.calls.filter((call) => String(call[0]) === url);
}

describe.skipIf(!hasDb)("outbound webhooks (integration)", () => {
  const createdEndpointIds: string[] = [];
  let workspaceId = "";
  let previousWebhookUrl: string | undefined;
  let previousFetch: typeof fetch;

  beforeAll(async () => {
    process.env.DEMO_USER_EMAIL ??= "demo@topology.local";
    process.env.TOPOLOGY_ISSUE_PROVIDER = "mock";

    const { eq } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { users } = await import("@/db/schema");
    const { ensureMembership } = await import("@/lib/workspace");
    const demo = await db.query.users.findFirst({
      where: eq(users.email, process.env.DEMO_USER_EMAIL!),
    });
    expect(demo?.id).toBeTruthy();
    const { workspace } = await ensureMembership(demo!.id, "admin");
    workspaceId = workspace.id;
  });

  afterEach(async () => {
    if (previousFetch) globalThis.fetch = previousFetch;
    if (previousWebhookUrl === undefined) delete process.env.TOPOLOGY_WEBHOOK_URL;
    else process.env.TOPOLOGY_WEBHOOK_URL = previousWebhookUrl;
    vi.restoreAllMocks();

    if (createdEndpointIds.length === 0) return;
    const { inArray } = await import("drizzle-orm");
    const { db } = await import("@/db");
    const { webhookEndpoints } = await import("@/db/schema");
    const ids = createdEndpointIds.splice(0, createdEndpointIds.length);
    await db.delete(webhookEndpoints).where(inArray(webhookEndpoints.id, ids));
  });

  async function insertEndpoint(input: { url: string; secret: string; events: string }) {
    const { db } = await import("@/db");
    const { webhookEndpoints } = await import("@/db/schema");
    const [row] = await db
      .insert(webhookEndpoints)
      .values({
        workspaceId,
        url: input.url,
        secret: input.secret,
        events: input.events,
        enabled: 1,
        description: "integration webhook",
      })
      .returning();
    createdEndpointIds.push(row.id);
    return row;
  }

  function installFetch(impl: typeof fetch) {
    previousFetch = globalThis.fetch;
    previousWebhookUrl = process.env.TOPOLOGY_WEBHOOK_URL;
    delete process.env.TOPOLOGY_WEBHOOK_URL;
    globalThis.fetch = impl;
  }

  it("signs run, issue, coverage, and proposal deliveries", async () => {
    const secret = "whsec_integration";
    const url = "http://8.8.8.8/hooks/topology-signed";
    await insertEndpoint({
      url,
      secret,
      events: "run.completed,issue.created,coverage.dropped,proposal.created",
    });

    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    installFetch(fetchImpl as unknown as typeof fetch);

    const { dispatchWebhook } = await import("@/lib/webhooks");
    const events = [
      ["run.completed", { run: { id: "run-1" } }],
      ["issue.created", { issue: { key: "MOCK-1" } }],
      ["coverage.dropped", { dimension: "automation" }],
      ["proposal.created", { proposal: { id: "p-1" } }],
    ] as const;

    for (const [event, data] of events) {
      const payload = await dispatchWebhook(event, { ...data }, workspaceId);
      await vi.waitFor(() => {
        const match = callsTo(fetchImpl, url).find((call) =>
          String(call[1]?.body ?? "").includes(payload.id),
        );
        expect(match).toBeTruthy();
      });
      const match = callsTo(fetchImpl, url).find((call) =>
        String(call[1]?.body ?? "").includes(payload.id),
      );
      const body = String(match?.[1]?.body ?? "");
      const headers = match?.[1]?.headers as Record<string, string>;
      const expected = createHmac("sha256", secret).update(body).digest("hex");
      expect(headers["X-Topology-Signature"]).toBe(`sha256=${expected}`);
      expect(headers["X-Topology-Event"]).toBe(event);
      const parsed = JSON.parse(body) as {
        id: string;
        event: string;
        createdAt: string;
        data: Record<string, unknown>;
      };
      expect(parsed.id).toBe(payload.id);
      expect(parsed.event).toBe(event);
      expect(parsed.createdAt).toBeTruthy();
      expect(parsed.data).toMatchObject(data);
    }
  });

  it("does not POST loopback or link-local webhook URLs", async () => {
    await insertEndpoint({
      url: "http://127.0.0.1/hook",
      secret: "whsec_local",
      events: "run.completed",
    });
    await insertEndpoint({
      url: "http://169.254.169.254/latest/meta-data",
      secret: "whsec_meta",
      events: "run.completed",
    });
    await insertEndpoint({
      url: "http://[::1]/hook",
      secret: "whsec_v6",
      events: "run.completed",
    });

    const fetchImpl = vi.fn(async () => new Response("ok", { status: 200 }));
    installFetch(fetchImpl as unknown as typeof fetch);
    const { dispatchWebhook } = await import("@/lib/webhooks");
    await dispatchWebhook("run.completed", { run: { id: "blocked" } }, workspaceId);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const urls = fetchImpl.mock.calls.map((call) => String(call[0]));
    expect(urls.some((target) => target.includes("127.0.0.1"))).toBe(false);
    expect(urls.some((target) => target.includes("169.254.169.254"))).toBe(false);
    expect(urls.some((target) => target.includes("::1"))).toBe(false);
  });

  it("sends an unsigned body when the secret is empty and does not retry a 500", async () => {
    const url = "http://8.8.8.4/hooks/topology-unsigned";
    await insertEndpoint({
      url,
      secret: "",
      events: "run.completed",
    });

    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    installFetch(fetchImpl as unknown as typeof fetch);
    const { dispatchWebhook } = await import("@/lib/webhooks");
    const payload = await dispatchWebhook(
      "run.completed",
      { run: { id: "unsigned" } },
      workspaceId,
    );
    await vi.waitFor(() => {
      expect(callsTo(fetchImpl, url).length).toBe(1);
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(callsTo(fetchImpl, url)).toHaveLength(1);
    const headers = callsTo(fetchImpl, url)[0]?.[1]?.headers as Record<
      string,
      string
    >;
    expect(headers["X-Topology-Signature"]).toBeUndefined();
    expect(headers["X-Topology-Event"]).toBe("run.completed");
    expect(String(callsTo(fetchImpl, url)[0]?.[1]?.body ?? "")).toContain(
      payload.id,
    );
  });
});
