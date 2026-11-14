import { expect, test } from "@playwright/test";

/**
 * UX-ERR-001: `/cases` data is loaded in the server component
 * (`loadCasesWorkspaceData`). The segment boundary in
 * `src/app/(app)/cases/error.tsx` renders only when that segment throws.
 * A browser `page.route` 500 never reaches that render. Next.js treats a
 * non-OK RSC response as a full document navigation, so the alert and
 * "Try again" button (same name as `RouteError`) are not mounted.
 * Enable this test when a cases GET failure renders that boundary.
 */
test.fixme("failed cases GET shows the route error boundary", async ({ page }) => {
  const isCasesPage = (url: URL) => url.pathname === "/cases";

  await page.route(isCasesPage, async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }
    await route.fulfill({
      status: 500,
      contentType: "text/plain",
      body: "forced cases failure",
    });
  });

  await page.goto("/cases");

  const alert = page.getByRole("alert");
  await expect(alert).toBeVisible();
  await expect(
    alert.getByRole("heading", { name: "Test cases couldn’t load" }),
  ).toBeVisible();
  await expect(
    alert.getByText("Unexpected error while loading this suite."),
  ).toBeVisible();

  await page.unroute(isCasesPage);

  const retry = page.getByRole("button", { name: "Try again" });
  if (await retry.isVisible()) {
    await retry.click();
    await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();
  }
});
