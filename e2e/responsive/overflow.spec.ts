import { expect, test } from "../fixtures";

const routes = [
  { path: "/", heading: "Home" },
  { path: "/cases", heading: "Test cases" },
  { path: "/runs", heading: "Test runs" },
  { path: "/reports", heading: "Reports" },
  { path: "/settings", heading: "Settings" },
] as const;

for (const route of routes) {
  test(`${route.path} has no horizontal overflow @responsive`, async ({ page }) => {
    await page.goto(route.path);
    await expect(
      page.getByRole("heading", { level: 1, name: route.heading }),
    ).toBeVisible();

    const extra = await page.evaluate(() => {
      const root = document.documentElement;
      return root.scrollWidth - root.clientWidth;
    });
    expect(extra).toBeLessThanOrEqual(1);
  });
}
