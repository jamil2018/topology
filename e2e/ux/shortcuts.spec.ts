import { expect, test } from "../fixtures";
import { SHORTCUTS } from "../../src/lib/shortcuts";

async function blurEditable(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
  });
}

test("cheat sheet lists every shortcut label", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await blurEditable(page);

  await page.keyboard.press("?");

  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();

  for (const shortcut of SHORTCUTS) {
    const label = dialog
      .locator("li span")
      .getByText(shortcut.label, { exact: true });
    await label.scrollIntoViewIfNeeded();
    await expect(label).toBeVisible();
  }

  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
});

test("J moves the cases list cursor", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();
  await blurEditable(page);

  // CasesWorkspace registers nav-next globally. The cursor is `aria-current`
  // on the row (`cases-table.tsx`), not DOM focus. Editable targets ignore J.
  const current = page.locator('[aria-current="true"]').locator("visible=true");
  await expect(current).toHaveCount(1);
  const before = (await current.innerText()).trim();

  const visibleRows = page.locator("tbody tr").locator("visible=true");
  expect(await visibleRows.count()).toBeGreaterThan(1);

  await page.keyboard.press("j");
  await expect(current).not.toHaveText(before);
});
