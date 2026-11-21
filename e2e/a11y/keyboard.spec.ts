import type { Locator, Page } from "@playwright/test";
import { expect, test, USERS } from "../fixtures";

/**
 * Same selector `shouldIgnoreShortcutTarget` uses in `src/lib/shortcuts.ts`.
 * Shortcuts must not match while focus is inside one of these controls.
 */
const EDITABLE_SELECTOR =
  "input, textarea, select, [contenteditable='true'], [contenteditable=''], [role='textbox'], [role='searchbox'], [role='combobox']";

async function isFocused(locator: Locator): Promise<boolean> {
  const count = await locator.count();
  if (count === 0) return false;
  return locator.evaluate((el) => {
    const active = document.activeElement;
    return el === active || el.contains(active);
  });
}

async function focusedInsideDialog(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const active = document.activeElement;
    return Boolean(active?.closest("[role='dialog']"));
  });
}

/** The first tab stop must bypass repeated navigation. */
async function assertSkipLinkIfPresent(page: Page, route: string) {
  const skip = page.getByRole("link", { name: /skip/i });
  await expect(skip, `Missing skip link on ${route}`).toHaveCount(1);
  const link = skip.first();
  // Cases (and other workspaces) may autofocus search; clear that so Tab
  // starts at the document beginning and lands on the skip link.
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
  await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  const href = await link.getAttribute("href");
  expect(href, "skip link href").toMatch(/^#[^#\s]+$/);
  const targetHref = href ?? "";
  await page.keyboard.press("Enter");
  const moved = await page.evaluate((targetIdHref) => {
    const id = decodeURIComponent(targetIdHref.slice(1));
    const target = document.getElementById(id);
    const active = document.activeElement;
    return Boolean(target && active && (active === target || target.contains(active)));
  }, targetHref);
  expect(moved, `skip link ${href} did not move focus to its target`).toBe(true);
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });
}

test.describe("logged out", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("login form tab order reaches email, password, and submit @a11y", async ({
    page,
  }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Topology" })).toBeVisible();
    await assertSkipLinkIfPresent(page, "/login");

    const email = page.getByLabel("Email");
    const password = page.getByLabel("Password");
    const submit = page.getByRole("button", { name: "Sign in with email" });
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(submit).toBeVisible();

    const trail: string[] = [];
    let stage = 0;
    for (let step = 0; step < 20 && stage < 3; step += 1) {
      await page.keyboard.press("Tab");
      trail.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          if (!(el instanceof HTMLElement)) return "(none)";
          const name =
            el.getAttribute("aria-label") ||
            el.getAttribute("name") ||
            el.textContent?.trim().replace(/\s+/g, " ").slice(0, 60) ||
            el.tagName;
          return `${el.tagName.toLowerCase()} ${name}`;
        }),
      );
      if (stage === 0 && (await isFocused(email))) {
        await page.keyboard.type(USERS.admin.email);
        stage = 1;
        continue;
      }
      if (stage === 1 && (await isFocused(password))) {
        await page.keyboard.type(USERS.admin.password);
        stage = 2;
        continue;
      }
      if (stage === 2 && (await isFocused(submit))) {
        await page.keyboard.press("Enter");
        stage = 3;
      }
    }

    expect(
      stage,
      `tab order did not reach email, password, and submit\n${trail.join("\n")}`,
    ).toBe(3);
    await expect(page.getByRole("heading", {name:"Home",exact:true})).toBeVisible({ timeout: 15_000 });
  });
});

test("shortcut cheat sheet traps focus and closes on escape @a11y", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();
  await assertSkipLinkIfPresent(page, "/cases");

  await page.keyboard.press("Shift+/");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();

  const focusableCount = await dialog
    .locator("button, a[href], input, textarea, select, [tabindex]:not([tabindex='-1'])")
    .count();
  expect(focusableCount).toBeGreaterThan(0);

  for (let i = 0; i < focusableCount + 1; i += 1) {
    await page.keyboard.press("Tab");
    expect(await focusedInsideDialog(page), "Tab left the Keyboard shortcuts dialog").toBe(
      true,
    );
  }
  for (let i = 0; i < focusableCount + 1; i += 1) {
    await page.keyboard.press("Shift+Tab");
    expect(
      await focusedInsideDialog(page),
      "Shift+Tab left the Keyboard shortcuts dialog",
    ).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("typing c in the case search field does not run a shortcut @a11y", async ({
  page,
}) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();

  const search = page.getByRole("textbox", { name: "Search cases" });
  await search.focus();
  const ignored = await page.evaluate((selector) => {
    const el = document.activeElement;
    if (!el || typeof el !== "object") return false;
    const node = el as HTMLElement;
    if (node.isContentEditable) return true;
    const tag = typeof node.tagName === "string" ? node.tagName.toUpperCase() : "";
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (typeof node.closest === "function" && node.closest(selector)) return true;
    return false;
  }, EDITABLE_SELECTOR);
  expect(ignored, "case search is not an editable shortcut target").toBe(true);

  await page.keyboard.type("c");
  await expect(search).toHaveValue("c");
  const url = new URL(page.url());
  expect(url.pathname).toBe("/cases");
  expect(url.searchParams.get("new")).toBeNull();
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveCount(0);
});
