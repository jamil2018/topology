import { expect, test } from "@playwright/test";

/**
 * WCAG 2.5.8 minimum on the primary shell header (`hub-shell.tsx`).
 * Add an accessible name here only when a decorative control is
 * intentionally smaller than 24px. Do not skip the rest of the header.
 */
const TOUCH_TARGET_EXCEPTIONS = new Set<string>([]);

test("primary header targets are at least 24px @responsive", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();

  const width = page.viewportSize()?.width ?? 0;
  const header = page.locator("header").first();
  const controls = header.locator("a, button");
  const count = await controls.count();
  expect(count).toBeGreaterThan(0);

  if (width >= 768) {
    await expect(
      header.getByRole("button", { name: "Keyboard shortcuts" }),
    ).toBeVisible();
    await expect(header.getByRole("button", { name: "Search ⌘K" })).toBeVisible();
  }

  const undersized: string[] = [];
  let checked = 0;
  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    if (!(await control.isVisible())) continue;
    const name =
      (await control.getAttribute("aria-label"))?.trim() ||
      (await control.innerText()).trim() ||
      "(unlabeled)";
    if (TOUCH_TARGET_EXCEPTIONS.has(name)) continue;
    const box = await control.boundingBox();
    checked += 1;
    if (!box || box.width < 24 || box.height < 24) {
      const size = box
        ? `${Math.round(box.width)}x${Math.round(box.height)}`
        : "no box";
      undersized.push(`${name} ${size}`);
    }
  }

  expect(checked).toBeGreaterThan(0);
  expect(undersized, "primary header controls under 24px").toEqual([]);
});
