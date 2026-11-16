import { expect, test } from "../fixtures";

/**
 * `hub-shell.tsx` hides the desktop sidebar below Tailwind `lg` (1024px)
 * and exposes it with the "Open sidebar" button. Widths under 768 use that
 * drawer. At 1024px and up the primary nav is on screen.
 */
const SIDEBAR_BREAKPOINT = 1024;

test("primary nav stays reachable @responsive", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();

  const width = page.viewportSize()?.width ?? 0;
  const openSidebar = page.getByRole("button", { name: "Open sidebar" });
  const casesLink = page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("link", { name: "Test cases" });

  if (width < SIDEBAR_BREAKPOINT) {
    await expect(openSidebar).toBeVisible();
    await openSidebar.click();
    await expect(casesLink).toBeVisible();
    return;
  }

  await expect(casesLink).toBeVisible();
  await expect(openSidebar).toBeHidden();
});
