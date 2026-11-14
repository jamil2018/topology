import { test, expect } from "../fixtures";
import { caseStatusButton, createReadyCase, startManualRun } from "./run-flow";

test("a new failure shows up under Triage", async ({ page }) => {
  test.setTimeout(60_000);
  const title = `E2E triage case ${Date.now()}`;
  await createReadyCase(page, title);
  await startManualRun(page, `E2E triage run ${Date.now()}`, [title]);

  await caseStatusButton(page, "failed").click();
  await expect(
    page.getByRole("button", { name: /^Failed \d+$/ }),
  ).toContainText("1");

  await page.goto("/triage");
  await expect(page.getByRole("heading", { name: "Triage" })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText("Nothing to triage yet")).toHaveCount(0);
  await expect(page.getByText(title).first()).toBeVisible({ timeout: 15_000 });
});
