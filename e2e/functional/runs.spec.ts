import { test, expect } from "../fixtures";
import {
  SEEDED_RUN_TITLES,
  caseStatusButton,
  focusedCaseKey,
  startManualRun,
} from "./run-flow";

test("pass, fail, block, skip, complete, and lock the run", async ({ page }) => {
  test.setTimeout(90_000);
  const name = `E2E run ${Date.now()}`;
  await startManualRun(page, name, SEEDED_RUN_TITLES);

  const caseList = page.getByRole("list", { name: "Run cases" });
  await expect(caseList.getByRole("listitem")).toHaveCount(SEEDED_RUN_TITLES.length);

  for (const status of ["passed", "failed", "blocked"] as const) {
    const before = await focusedCaseKey(page).innerText();
    await caseStatusButton(page, status).click();
    await expect(
      caseList.getByRole("button", { name: new RegExp(`${before}.* · ${status}$`) }),
    ).toBeVisible({ timeout: 10_000 });
    await expect(focusedCaseKey(page)).not.toHaveText(before, { timeout: 10_000 });
  }

  await expect(caseStatusButton(page, "skipped")).toBeVisible();
  const skippedKey = await focusedCaseKey(page).innerText();
  await caseStatusButton(page, "skipped").click();
  await expect(page.getByRole("list", {name:"Run cases"}).getByRole("button", {name:new RegExp(`${skippedKey}.* · skipped$`)})).toBeVisible();

  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Complete this run?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Complete run" }).click();

  await expect(
    page.getByText("This run is completed and locked."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.getByRole("button", { name: "Complete", exact: true }),
  ).toHaveCount(0);
  await expect(caseStatusButton(page, "passed")).toBeDisabled();
  await expect(caseStatusButton(page, "failed")).toBeDisabled();
  await expect(caseStatusButton(page, "blocked")).toBeDisabled();
  await expect(caseStatusButton(page, "skipped")).toBeDisabled();
});
