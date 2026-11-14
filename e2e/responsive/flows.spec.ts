import { expect, test } from "@playwright/test";

/** Desktop sidebar vs drawer. See `hub-shell.tsx` (`lg` / 1024px). */
const SIDEBAR_BREAKPOINT = 1024;

test("cases and runs stay usable @responsive", async ({ page }) => {
  const width = page.viewportSize()?.width ?? 0;

  await page.goto("/cases");
  await expect(
    page.getByRole("heading", { level: 1, name: "Test cases" }),
  ).toBeVisible();
  if (width < SIDEBAR_BREAKPOINT) {
    await expect(page.getByRole("button", { name: "Open sidebar" })).toBeVisible();
  } else {
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
  }

  await page.goto("/runs");
  await expect(
    page.getByRole("heading", { level: 1, name: "Test runs" }),
  ).toBeVisible();

  const firstRun = page
    .locator("main a[href^='/runs/']:not([href='/runs/new'])")
    .first();
  if ((await firstRun.count()) === 0) return;

  await firstRun.click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});
