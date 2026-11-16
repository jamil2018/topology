import { expect, test } from "../fixtures";

for (const failure of ["server rejection", "connection loss", "expired session"] as const) {
  test(`editing survives ${failure} and saves after recovery`, async ({ page, makeCase }) => {
    const created = await makeCase();
    await page.goto(`/cases?case=${created.id}`);
    const dialog = page.getByRole("dialog", { name: /^Case / });
    const title = dialog.getByLabel("Title", { exact: true });
    await expect(title).toHaveValue(created.title);
    const draft = `${created.title} recovered`;
    await title.fill(draft);
    const pattern = `**/api/cases/${created.id}`;
    await page.route(pattern, async (route) => {
      if (route.request().method() !== "PATCH") return route.continue();
      if (failure === "connection loss") return route.abort("connectionfailed");
      await route.fulfill({ status: failure === "expired session" ? 401 : 500, json: { error: failure } });
    });
    const save = dialog.getByRole("button", { name: "Save", exact: true });
    await save.click();
    await expect(save).toBeEnabled();
    await expect(title).toHaveValue(draft);
    if (failure !== "connection loss") await expect(dialog.getByText(failure, { exact: true })).toBeVisible();
    const unchanged = await page.request.get(`/api/cases/${created.id}`);
    expect(unchanged.status()).toBe(200);
    expect((await unchanged.json()).case.title).toBe(created.title);
    await page.unroute(pattern);
    await save.click();
    await expect(save).toBeDisabled();
    await page.reload();
    await expect(page.getByRole("dialog", { name: /^Case / }).getByLabel("Title", { exact: true })).toHaveValue(draft);
  });
}

test("a slow save remains locked until its response arrives", async ({ page, makeCase }) => {
  const created = await makeCase();
  await page.goto(`/cases?case=${created.id}`);
  const dialog = page.getByRole("dialog", { name: /^Case / });
  const title = dialog.getByLabel("Title", { exact: true });
  await expect(title).toHaveValue(created.title);
  await title.fill(`${created.title} slow`);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let mutations = 0;
  await page.route(`**/api/cases/${created.id}`, async (route) => {
    if (route.request().method() === "PATCH") { mutations++; await gate; }
    await route.continue();
  });
  try {
    await dialog.getByRole("button", { name: "Save", exact: true }).click();
    await expect.poll(() => mutations).toBe(1);
    await expect(dialog.getByRole("button", { name: /Saving/ })).toBeDisabled();
  } finally { release(); }
  await expect(dialog.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(mutations).toBe(1);
  await page.reload();
  await expect(page.getByRole("dialog", { name: /^Case / }).getByLabel("Title", { exact: true })).toHaveValue(`${created.title} slow`);
});
