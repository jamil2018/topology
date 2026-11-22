import { expect, type Page } from "@playwright/test";

/** Seeded ready cases. Four is enough to pass, fail, block, skip, then complete. */
export const SEEDED_RUN_TITLES = [
  "Shopper can open the storefront home",
  "Shopper can open a product detail page",
  "Shopper can open the cart drawer",
  "Shopper can open the account sign-in page",
] as const;

export async function createReadyCase(page: Page, title: string) {
  const key = `E2E-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
  const res = await page.request.post("/api/cases", {
    data: {
      key,
      title,
      status: "ready",
      priority: "P2",
    },
  });
  const text = await res.text();
  expect(res.ok(), text).toBeTruthy();
  return key;
}

/**
 * Start a manual run from the real picker.
 * The page defaults to every ready case, which cannot be completed until each
 * result is terminal, so the selection is cleared and limited to `titles`.
 */
export async function startManualRun(
  page: Page,
  name: string,
  titles: readonly string[],
) {
  await page.goto("/runs/new");
  await expect(page.getByRole("heading", { name: "Start a run" })).toBeVisible();
  await page.getByLabel("Run name").filter({visible:true}).fill(name);

  const selectAll = page.getByRole("checkbox", {
    name: "Select all visible cases",
  });
  await expect(selectAll).toBeChecked();
  // HeroUI Checkbox.Control overlays the native input hit target.
  await selectAll.click({ force: true });
  await expect(page.getByText("0 selected", { exact: true })).toBeVisible();

  for (const title of titles) {
    await page.getByLabel("Search", { exact: true }).fill(title);
    await page
      .getByRole("checkbox", { name: `Select ${title}`, exact: true })
      .check({ force: true });
    await page.getByLabel("Search", { exact: true }).fill("");
  }
  await expect(
    page.getByText(`${titles.length} selected`, { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: /Create run/ }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible({
    timeout: 20_000,
  });

  const start = page.getByRole("button", { name: "Start", exact: true });
  if (await start.isVisible()) {
    const started = page.waitForResponse(response => response.request().method() === "PATCH" && response.request().postDataJSON()?.action === "start");
    await start.click();
    expect((await started).ok()).toBeTruthy();
    await expect(start).toBeHidden({ timeout: 15_000 });
  }
}

export function caseStatusButton(
  page: Page,
  status: "passed" | "failed" | "blocked" | "skipped",
) {
  return page
    .getByRole("button", { name: new RegExp(`^Mark \\S+ as ${status}$`) })
    .first();
}

export function focusedCaseKey(page: Page) {
  return page.locator("article").getByText(/^HAR-\d+$|^E2E-[A-Z0-9-]+$/);
}
