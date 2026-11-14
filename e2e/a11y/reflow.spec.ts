import { expect, test } from "../fixtures";

// Width is set inside the test so this stays an @a11y check on every project.
test("cases page reflows at 320px without horizontal scroll @a11y", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(
    scrollWidth,
    `documentElement scrollWidth ${scrollWidth} exceeds clientWidth ${clientWidth}`,
  ).toBeLessThanOrEqual(clientWidth + 1);
});
