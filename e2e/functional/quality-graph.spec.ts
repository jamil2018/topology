import { test, expect } from "../fixtures";

test("quality graph preference reveals Intents and Releases", async ({
  page,
}) => {
  const nav = () => page.getByRole("navigation", { name: "Primary" });
  const intents = () =>
    nav().getByRole("link", { name: "Intents", exact: true });

  try {
    await page.goto("/settings?section=projects");
    await expect(
      page.getByRole("heading", { name: "Advanced Quality Graph" }),
    ).toBeVisible();

    const toggle = page.getByRole("button", {
      name: /^Quality graph (on|off)$/,
    });
    await expect(toggle).toBeVisible();
    if ((await toggle.innerText()).includes("off")) {
      await expect(intents()).toHaveCount(0);
      const saved = page.waitForResponse(
        (res) =>
          res.url().includes("/api/workspace/preferences") &&
          res.request().method() === "PATCH" &&
          res.ok(),
      );
      await toggle.click();
      await saved;
    }

    await expect(
      page.getByRole("button", { name: "Quality graph on" }),
    ).toBeVisible();
    await expect(intents()).toBeVisible();

    await intents().click();
    await expect(
      page.getByRole("heading", { name: "Test Intents" }),
    ).toBeVisible();

    await nav().getByRole("link", { name: "Releases", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Releases" }),
    ).toBeVisible();
  } finally {
    await page.request.patch("/api/workspace/preferences", {
      data: { qualityGraphEnabled: false },
    });
  }
});

test("quality graph authoring persists into coverage, release snapshots and comparison", async ({ page, isolatedProject }) => {
  const api = isolatedProject.admin;
  const intentResponse = await api.post("/api/intents", { data: { key: "QUAL-1", title: "Checkout is safe", behavior: "Declined payments never charge", criticality: "P0", status: "ready" } });
  expect(intentResponse.status()).toBe(201);
  const { intent } = await intentResponse.json();
  const requirementResponse = await api.post("/api/requirements", { data: { key: "REQ-1", title: "No duplicate charges", criticality: "P0" } });
  expect(requirementResponse.status()).toBe(201);
  const { requirement } = await requirementResponse.json();
  const before = await api.post("/api/releases", { data: { name: "Before coverage" } });
  expect(before.status()).toBe(201);
  const baseline = await before.json();
  expect(baseline.snapshot.payload.requirement).toEqual({ total: 1, covered: 0, pct: 0 });
  const linked = await api.patch("/api/requirements", { data: { id: requirement.id, coversIntentIds: [intent.id] } });
  expect(linked.status()).toBe(200);
  const read = await api.get("/api/requirements");
  expect(read.status()).toBe(200);
  expect((await read.json()).requirements).toEqual([expect.objectContaining({ id: requirement.id, coversIntentIds: [intent.id] })]);
  const coverage = await api.get("/api/coverage");
  expect(coverage.status()).toBe(200);
  expect((await coverage.json()).coverage.requirement).toEqual({ total: 1, covered: 1, pct: 100 });
  const after = await api.post("/api/releases", { data: { name: "After coverage" } });
  expect(after.status()).toBe(201);
  const current = await after.json();
  const comparison = await api.post("/api/releases/compare", { data: { beforeReleaseId: baseline.release.id, afterReleaseId: current.release.id } });
  expect(comparison.status()).toBe(200);
  expect((await comparison.json()).comparison.requirement).toMatchObject({ coveredDelta: 1, totalDelta: 0, pctDelta: 100 });
  const analysis = await api.post("/api/releases/analyze", { data: {} });
  expect(analysis.status()).toBe(200);
  expect((await analysis.json()).quality).toMatchObject({ affected: { requirements: 1, intents: 1 }, execution: { executed: 0, notExecuted: 1, passRate: null } });
  await page.goto("/requirements");
  await expect(page.getByRole("button", { name: /REQ-1 No duplicate charges/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /REQ-1 No duplicate charges/ })).toBeVisible();
  await page.goto("/releases");
  await expect(page.getByRole("link", { name: /^Before coverage/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /^After coverage/ })).toBeVisible();
  // A later link cannot mutate an already-frozen release snapshot.
  const frozen = await api.get(`/api/releases/${baseline.release.id}`);
  expect(frozen.status()).toBe(200);
  expect((await frozen.json()).snapshot.payload.requirement.covered).toBe(0);
});
