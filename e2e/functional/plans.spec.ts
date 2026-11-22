import { test, expect } from "../fixtures";

test("create a plan and open its detail", async ({ page }) => {
  const name = `E2E plan ${Date.now()}`;
  await page.goto("/plans");
  await expect(page.getByRole("heading", { name: "Plans" })).toBeVisible();

  await page.getByRole("button", { name: "New plan" }).click();
  await expect(page.getByRole("heading", { name: "New plan" })).toBeVisible();
  await page.getByLabel("Plan name").fill(name);
  await page.getByRole("button", { name: "Create plan" }).click();

  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.getByRole("button", { name: "Launch matrix" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "All plans" })).toBeVisible();
});

test("save and launch a regression baseline after editing its source case", async ({ page, makeCase, isolatedProject }) => {
  const title = "Pinned checkout procedure";
  const original = await makeCase(title);
  const api = isolatedProject.admin;
  const response = await api.post("/api/plans", { data: { name: "Checkout smoke", caseIds: [original.id] } });
  expect(response.status()).toBe(201);
  const { plan } = await response.json();
  await page.goto(`/plans/${plan.id}`);
  await page.getByLabel("Baseline name").fill("Checkout v1");
  await page.getByRole("button", { name: "Save baseline from saved plan" }).click();
  const launch = page.getByRole("button", { name: "Launch baseline Checkout v1" });
  await expect(launch).toBeVisible();
  expect((await api.patch(`/api/cases/${original.id}`, { data: { title: "Updated checkout procedure" } })).status()).toBe(200);
  await launch.click();
  await page.getByRole("button", { name: "Open first run" }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
});

test("author → matrix plan → failure → triage → retest → report preserves history", async ({ page, makeCase, isolatedProject }) => {
  test.setTimeout(90_000);
  const created = await makeCase();
  const api = isolatedProject.admin;
  const planResponse = await api.post("/api/plans", { data: { name: "Validation matrix", caseIds: [created.id], matrix: { browsers: ["chromium", "firefox"], operatingSystems: ["Linux"] } } });
  expect(planResponse.status()).toBe(201);
  const { plan } = await planResponse.json();
  const launch = await api.post(`/api/plans/${plan.id}/launch`, { data: {} });
  expect(launch.status()).toBe(201);
  const { runs } = await launch.json();
  expect(runs).toHaveLength(2);
  expect(runs.map((run: { matrixBrowser: string }) => run.matrixBrowser).sort()).toEqual(["chromium", "firefox"]);
  for (const run of runs) {
    const stored = await api.get(`/api/runs/${run.id}`);
    expect(stored.status()).toBe(200);
    expect((await stored.json()).run.results).toEqual([expect.objectContaining({ caseId: created.id, status: "untested" })]);
  }
  const original = runs[0];
  await page.goto(`/runs/${original.id}`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^Mark ${created.key} as failed$`) }).click();
  await expect(page.getByRole("button", { name: /^Failed \d+$/ })).toContainText("1");
  const failedRun = await api.get(`/api/runs/${original.id}`);
  const failure = (await failedRun.json()).run.results[0];
  expect(failure.status).toBe("failed");
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await page.getByRole("button", { name: "Complete run", exact: true }).click();
  await expect(page.getByText("This run is completed and locked.")).toBeVisible();
  await page.goto("/triage");
  const groups = page.getByRole("button", { name: /Show failures/ });
  while (await groups.count()) await groups.first().click();
  await expect(page.getByRole("heading", { name: `${created.key} · ${created.title}`, exact: true })).toBeVisible();
  const retest = await api.post("/api/runs/retest", { data: { name: "Validated retest", sourceResultIds: [failure.id] } });
  expect(retest.status()).toBe(201);
  const fresh = (await retest.json()).run;
  const freshRead = await api.get(`/api/runs/${fresh.id}`);
  expect((await freshRead.json()).run.results).toEqual([expect.objectContaining({ caseId: created.id, status: "untested" })]);
  await page.goto(`/runs/${fresh.id}`);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.getByRole("button", { name: new RegExp(`^Mark ${created.key} as passed$`) }).click();
  await expect(page.getByRole("button", { name: new RegExp(`^Mark ${created.key} as passed$`) })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await page.getByRole("button", { name: "Complete run", exact: true }).click();
  await expect(page.getByText("This run is completed and locked.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: new RegExp(`^Mark ${created.key} as passed$`) })).toHaveAttribute("aria-pressed", "true");
  const originalRead = await api.get(`/api/runs/${original.id}`);
  expect((await originalRead.json()).run.results[0]).toMatchObject({ id: failure.id, status: "failed" });
  const report = await api.get(`/api/reports/${fresh.id}/export?format=csv`);
  expect(report.status()).toBe(200);
  const csv = await report.text();
  expect(csv.trim().split("\n")).toHaveLength(2);
  expect(csv).toContain(created.key);
  expect(csv).toContain(",passed,");
  expect(csv).not.toContain(",failed,");
  await page.goto(`/reports/${fresh.id}`);
  await expect(page.getByRole("heading", { name: "Validated retest", exact: true })).toBeVisible();
});
