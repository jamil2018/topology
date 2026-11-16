import { expect, test } from "../fixtures";

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
