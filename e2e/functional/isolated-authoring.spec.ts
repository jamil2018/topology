import { expect, test } from "../fixtures";

test("preview and import a completed vendor run from the browser", async ({ page, isolatedProject }) => {
  await page.goto("/cases/import");
  await page.getByRole("link", { name: "Import run history" }).click();
  const runTitle = "Historical checkout";
  const bundle = {
    provider: "qase", sourceNamespace: "browser-qual", runs: [{
      run: { id: 7, title: runTitle, status_text: "passed", end_time: "2025-09-01T00:00:00Z" },
      results: [{ hash: "checkout-pass", run_id: 7, case_id: 99, status: "passed" }],
    }],
  };
  await page.getByLabel("History bundle").setInputFiles({
    name: "history.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bundle)),
  });
  await page.getByRole("button", { name: "Preview bundle" }).click();
  await expect(page.getByText("Ready to import", { exact: true })).toBeVisible();
  await expect(page.getByText("1 unmapped · 0 ambiguous source cases")).toBeVisible();
  const apply = page.waitForResponse((response) => response.url().includes("/api/import/history?mode=apply"));
  await page.getByRole("button", { name: "Import 1 run" }).click();
  expect((await apply).ok()).toBeTruthy();
  await page.getByRole("link", { name: runTitle, exact: true }).click();
  await expect(page.getByRole("heading", { name: runTitle })).toBeVisible();
  await expect(page.getByRole("link", { name: "View report" })).toBeVisible();
  expect((await isolatedProject.admin.get("/api/runs")).ok()).toBeTruthy();
});

test("unique project authoring persists and rejects another project's viewer", async ({ page, makeCase, isolatedProject, asViewer }) => {
  const created = await makeCase();
  await page.goto("/cases");
  await page.getByLabel("Search cases").filter({ visible: true }).fill(created.title);
  await expect(page.getByRole("button", { name: created.title, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: created.title, exact: true })).toBeVisible();
  const denied = await asViewer.request.get(`/api/cases/${created.id}`, { headers: { "x-topology-project-id": isolatedProject.id } });
  expect(denied.status()).toBe(403);
  expect((await denied.json()).case).toBeUndefined();
  const listed = await isolatedProject.admin.get("/api/cases?limit=50");
  expect(listed.status()).toBe(200);
  expect((await listed.json()).cases.map((row: { key: string }) => row.key)).toEqual([created.key]);
});
