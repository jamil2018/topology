import { randomUUID } from "node:crypto";
import { expect, test, TOKENS } from "../fixtures";

test("real HTTP rejects revoked credentials and enforces disjoint token scopes", async ({ api }) => {
  const revoked = await api(TOKENS.revoked);
  expect((await revoked.get("/api/ci/runs")).status()).toBe(401);
  const read = await api(TOKENS.read);
  expect((await read.get("/api/ci/runs")).status()).toBe(200);
  expect((await read.post("/api/ci/runs", { data: { name: "Forbidden" } })).status()).toBe(403);
  expect((await read.get("/api/agent?resource=cases")).status()).toBe(403);
  const ci = await api(TOKENS.ciWrite);
  expect((await ci.get("/api/agent?resource=cases")).status()).toBe(403);
  const agent = await api(TOKENS.agent);
  expect((await agent.post("/api/ci/runs", { data: { name: "Forbidden" } })).status()).toBe(403);
  const response = await agent.get("/api/agent?resource=cases");
  expect(response.status()).toBe(200);
  const { cases } = await response.json();
  expect(cases.length).toBeGreaterThan(0);
  expect(cases.some((row: { key: string }) => row.key === "FOR-1")).toBe(false);
});

test("scoped agent HTTP creates one auditable proposal and preserves legacy reads across cutover", async ({ page, api }) => {
  const projects = await (await page.request.get("/api/projects")).json();
  const projectId = projects.activeProjectId;
  expect(projectId).toBeTruthy();
  const generated = await page.request.post("/api/tokens", {
    data: { name: "Scoped agent HTTP", scope: ["agent-read", "agent-propose"] },
  });
  expect(generated.status()).toBe(200);
  const { plaintext } = await generated.json();
  const client = await api(plaintext);
  const list = await client.get("/api/v1/agent?resource=cases&limit=1", { maxRedirects: 0 });
  expect(list.status()).toBe(200);
  expect((await list.json()).nextCursor).toBeTruthy();

  const data = {
    action: "propose_coverage", payload: { diffs: [
      { entityType: "case", action: "create", before: null, after: { key: "SCOPE-NEW", title: "Agent-proposed case" } },
    ] },
  };
  const headers = { "Idempotency-Key": "scoped-e2e-test" };
  const first = await client.post("/api/v1/agent", { data, headers, maxRedirects: 0 });
  const retry = await client.post("/api/v1/agent", { data, headers, maxRedirects: 0 });
  expect(first.status()).toBe(201);
  expect(retry.status()).toBe(201);
  expect(await retry.json()).toEqual(await first.json());
  expect((await (await client.get("/api/v1/agent?resource=cases&q=SCOPE-NEW")).json()).cases).toEqual([]);

  const cutover = await page.request.patch("/api/projects", { data: { id: projectId, legacyAgentWrites: false } });
  expect(cutover.status()).toBe(200);
  const legacy = await api(TOKENS.agent);
  expect((await legacy.get("/api/agent?resource=cases")).status()).toBe(200);
  const rejected = await legacy.post("/api/agent", { data: { action: "create_case", title: "Legacy write" } });
  expect(rejected.status()).toBe(403);
  expect((await rejected.json()).code).toBe("LEGACY_WRITE_DISABLED");
});

test("real HTTP revocation invalidates a newly issued token immediately", async ({ page, api }) => {
  const response = await page.request.post("/api/tokens", { data: { name: `HTTP token ${randomUUID()}`, scope: "read" } });
  expect(response.status()).toBe(200);
  const created = await response.json();
  try {
    const context = await api(created.plaintext);
    expect((await context.get("/api/ci/runs")).status()).toBe(200);
    const revoked = await page.request.delete("/api/tokens", { data: { id: created.token.id } });
    expect(revoked.status()).toBe(200);
    expect((await context.get("/api/ci/runs")).status()).toBe(401);
  } finally {
    expect((await page.request.delete("/api/tokens", { data: { id: created.token.id } })).status()).toBe(200);
  }
});

test("scoped agents attach and read evidence on an assigned result through real HTTP", async ({ page, api }) => {
  const generated = await page.request.post("/api/tokens", {
    data: { name: "Scoped evidence HTTP", scope: ["agent-read", "agent-run", "agent-observe"] },
  });
  expect(generated.status()).toBe(200);
  const { plaintext } = await generated.json();
  const client = await api(plaintext);
  const { cases } = await (await client.get("/api/v1/agent?resource=cases&status=ready&limit=1")).json();
  expect(cases).toHaveLength(1);
  const created = await client.post("/api/v1/agent", {
    headers: { "Idempotency-Key": "evidence-run" },
    data: { action: "create_run", name: "Evidence check", caseIds: [cases[0].id] },
  });
  expect(created.status()).toBe(201);
  const { run } = await created.json();
  const { results } = await (await client.get(`/api/v1/agent?resource=results&runId=${run.id}`)).json();
  expect(results.length).toBeGreaterThan(0);
  const resultId = results[0].id;
  const evidence = "Observed expected behavior independently";
  const observation = {
    headers: { "Idempotency-Key": "evidence-observation" },
    data: {
      action: "record_result", runId: run.id, resultId, status: "passed",
      evidence: { filename: "observation.txt", contentType: "text/plain", dataBase64: Buffer.from(evidence).toString("base64") },
    },
  };
  const [recorded, replay] = await Promise.all([
    client.post("/api/v1/agent", observation),
    client.post("/api/v1/agent", observation),
  ]);
  expect(recorded.status()).toBe(200);
  expect(replay.status()).toBe(200);
  const body = await recorded.json();
  expect(await replay.json()).toEqual(body);
  expect(body.attachment).toMatchObject({ filename: "observation.txt", kind: "log" });
  const { result } = await (await client.get(`/api/v1/agent?resource=result&id=${resultId}`)).json();
  expect(result.attachments).toMatchObject([body.attachment]);
  const download = await client.get(body.attachment.url, { maxRedirects: 0 });
  expect(download.status()).toBe(200);
  expect(await download.text()).toBe(evidence);
  expect((await (await api(TOKENS.ciWrite)).get(body.attachment.url, { maxRedirects: 0 })).status()).toBe(403);
});


test("SEC-SECRET-002: webhook secrets are write-only even for an admin", async ({ page }) => {
  const secret = "validation-webhook-regression-secret";
  const created = await page.request.post("/api/webhooks", { data: { url: "https://8.8.8.8/hook", secret, enabled: false } });
  expect(created.status()).toBe(200);
  const body = await created.json();
  expect(JSON.stringify(body)).not.toContain(secret);
  try {
    const list = await page.request.get("/api/webhooks");
    expect(list.status()).toBe(200);
    expect(await list.text()).not.toContain(secret);
    const updated = await page.request.patch("/api/webhooks", { data: { id: body.endpoint.id, description: "Secret remains configured" } });
    expect(updated.status()).toBe(200);
    expect(await updated.text()).not.toContain(secret);
  } finally {
    expect((await page.request.delete("/api/webhooks", { data: { id: body.endpoint.id } })).status()).toBe(200);
  }
});


test("CLI bearer-only coverage, impact, query and git ingress reach scoped handlers", async ({ api }) => {
  const read = await api(TOKENS.read);
  const coverage = await read.get("/api/coverage", { maxRedirects: 0 });
  expect(coverage.status()).toBe(200);
  expect(coverage.headers()["content-type"]).toContain("application/json");
  expect((await coverage.json()).coverage.execution.total).toBeGreaterThan(0);
  const affected = await read.post("/api/affected", { data: { paths: ["src/checkout.ts"] }, maxRedirects: 0 });
  expect(affected.status()).toBe(200);
  expect((await affected.json()).paths).toEqual(["src/checkout.ts"]);
  const query = await read.post("/api/query", { data: { query: { entity: "intents", filters: [], sort: [] }, limit: 2 }, maxRedirects: 0 });
  expect(query.status()).toBe(200);
  const rows = await query.json();
  expect(rows.entity).toBe("intents");
  expect(rows.count).toBe(2);
  const git = { remoteUrl: "https://github.com/validation/local-fixture", commit: { sha: "validation-commit", paths: ["src/checkout.ts"] } };
  expect((await read.post("/api/git/ingest", { data: git, maxRedirects: 0 })).status()).toBe(403);
  const writer = await api(TOKENS.ciWrite);
  const ingested = await writer.post("/api/git/ingest", { data: git, maxRedirects: 0 });
  expect(ingested.status()).toBe(200);
  expect(await ingested.json()).toMatchObject({ ok: true, repositoryId: expect.any(String), commitId: expect.any(String) });
  const anonymous = await api("");
  for (const path of ["/api/affected", "/api/query", "/api/git/ingest"]) {
    expect((await anonymous.post(path, { data: {}, maxRedirects: 0 })).status()).toBe(401);
  }
  expect((await anonymous.get("/api/coverage", { maxRedirects: 0 })).status()).toBe(401);
});
