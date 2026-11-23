import { expect, test } from "@playwright/test";

test("consumer Playwright result", async ({ page }) => {
  await page.setContent("<h1>Consumer fixture</h1>");
  await expect(page.getByRole("heading", { name: "Consumer fixture" })).toBeVisible();
});
