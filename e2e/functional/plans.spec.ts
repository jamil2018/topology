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
