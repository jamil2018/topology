import { expect, test } from "../fixtures";

test.use({ reducedMotion: "reduce" });

test("reduced motion keeps the home page visible @a11y", async ({ page }) => {
  await page.goto("/");
  const reduced = await page.evaluate(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  expect(reduced).toBe(true);
  await expect(
    page.locator("main").or(page.getByRole("heading", { name: "Topology" })),
  ).toBeVisible();
});
