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
