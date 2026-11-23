import { expect, test } from "../fixtures";

const routes = [
  { path: "/cases", heading: "Test cases" },
  { path: "/cases/import/history", heading: "Import run history" },
  { path: "/runs/explore", heading: "New exploratory session" },
  { path: "/requirements", heading: "Requirements" },
];

test("catalog and roadmap workflows reflow at 320 CSS px @a11y", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const route of routes) {
    await page.goto(route.path);
    await expect(page.getByRole("heading", { name: route.heading, exact: true })).toBeVisible();
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth, `${route.path} overflows (content ${scrollWidth}px, viewport ${clientWidth}px)`)
      .toBeLessThanOrEqual(clientWidth + 1);
  }
});
