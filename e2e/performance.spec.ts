import { performance } from "node:perf_hooks";
import { expect, test } from "./fixtures";

const p95 = (samples: number[]) => [...samples].sort((a, b) => a - b)[Math.ceil(samples.length * 0.95) - 1];
type LongTask = { startTime: number; duration: number };
test.describe("production scale budgets", () => {
  test.beforeEach(async ({ page }) => {
    const projectId = process.env.PERF_PROJECT_ID;
    expect(projectId, "Performance must run against an isolated 50k-case fixture").toBeTruthy();
    const response = await page.request.post("/api/projects", { data: { action: "select", id: projectId } });
    expect(response.status()).toBe(200);
  });
  test("OPS-PERF-001: 50,000 cases with HTTP p95 below 500 ms", async ({ page }, testInfo) => {
    const samples: number[] = [];
    for (let index = 0; index < 110; index++) {
      const started = performance.now();
      const response = await page.request.get(`/api/cases?limit=50&page=${1 + index % 10}`);
      const elapsed = performance.now() - started;
      expect(response.status()).toBe(200);
      const body = await response.json();
      expect(body.total).toBe(50_000);
      expect(body.cases).toHaveLength(50);
      if (index >= 10) samples.push(elapsed);
    }
    await testInfo.attach("cases-http-performance.json", { body: JSON.stringify({ warmups: 10, fixtureCases: 50000, samples, p95Ms: p95(samples), measured: "complete HTTP response, including body" }), contentType: "application/json" });
    expect(p95(samples)).toBeLessThan(500);
  });
  test("OPS-PERF-002: 5,000-result executor paint, virtualization and interactions", async ({ page }, testInfo) => {
    const runId = process.env.PERF_RUN_ID;
    await page.addInitScript(() => {
      const target = window as typeof window & { validationLongTasks: LongTask[] };
      target.validationLongTasks = [];
      new PerformanceObserver((list) => {
        target.validationLongTasks.push(...list.getEntries().map(({ startTime, duration }) => ({ startTime, duration })));
      }).observe({ type: "longtask", buffered: false });
    });
    await page.goto(`/runs/${runId}`, { waitUntil: "commit" });
    const started = performance.now();
    const list = page.getByRole("list", { name: "Run cases" });
    await expect(list.getByRole("button").first()).toBeVisible({ timeout: 2000 });
    await expect(page.getByRole("button", { name: /^Mark \S+ as passed$/ }).first()).toBeEnabled({ timeout: 2000 });
    const paintMs = performance.now() - started;
    expect(await list.getByRole("button").count()).toBeLessThan(200);
    // Closed retest controls must not mount a second list of all failed results.
    await expect(page.getByText("Select failures to retest", { exact: true })).toHaveCount(0);
    const interactionStart = await page.evaluate(() => window.performance.now());
    const samples: number[] = [];
    for (let index = 0; index < 20; index++) {
      const status = index % 2 ? "failed" : "passed";
      const response = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes(`/api/runs/${runId}`));
      const clickStarted = performance.now();
      await page.getByRole("button", { name: new RegExp(`^Mark \\S+ as ${status}$`) }).first().click();
      expect((await response).status()).toBe(200);
      samples.push(performance.now() - clickStarted);
    }
    await list.evaluate((element) => { element.parentElement!.scrollTop = 2499 * 56; });
    await expect(list.getByRole("button").first()).toBeVisible();
    await list.getByRole("button").first().click();
    expect(await list.getByRole("button").count()).toBeLessThan(200);
    const failed = page.waitForResponse((response) => response.request().method() === "PATCH" && response.url().includes(`/api/runs/${runId}`));
    await page.getByRole("button", { name: /^Mark \S+ as failed$/ }).first().click();
    expect((await failed).status()).toBe(200);
    const longTasks = await page.evaluate(() => (window as typeof window & { validationLongTasks: LongTask[] }).validationLongTasks);
    const startupLongTasks = longTasks.filter(({ startTime }) => startTime < interactionStart);
    const interactionLongTasks = longTasks.filter(({ startTime }) => startTime >= interactionStart);
    await testInfo.attach("executor-performance.json", {
      body: JSON.stringify({ results: 5000, paintMs, samples, p95Ms: p95(samples), startupLongTasks, interactionLongTasks }),
      contentType: "application/json",
    });
    expect(paintMs).toBeLessThan(2000);
    expect(p95(samples)).toBeLessThan(500);
    expect(Math.max(0, ...interactionLongTasks.map(({ duration }) => duration))).toBeLessThan(200);
  });
  test("OPS-PERF-003: 10,000-result JUnit ingest completes under 30 seconds", async ({ api, page }, testInfo) => {
    test.setTimeout(60_000);
    const context = await api("topo_validation_performance_token");
    const results = Array.from({ length: 10000 }, (_, index) => ({ externalKey: `scale::${index}`, classname: "scale", name: `Test ${index}`, status: "passed", durationMs: 1, notes: "" }));
    const started = performance.now();
    const response = await context.post("/api/ci/junit", { data: { name: "10k ingestion budget", results }, timeout: 30_000 });
    const elapsedMs = performance.now() - started;
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.summary).toMatchObject({ total: 10000, passed: 10000, failed: 0 });
    await page.reload();
    const persisted = await page.request.get(`/api/runs/${body.run.id}`);
    expect(persisted.status()).toBe(200);
    const saved = await persisted.json();
    expect(saved.run.results).toHaveLength(10000);
    await testInfo.attach("ingest-performance.json", { body: JSON.stringify({ results: 10000, elapsedMs, budgetMs: 30000 }), contentType: "application/json" });
    expect(elapsedMs).toBeLessThan(30_000);
  });
});
