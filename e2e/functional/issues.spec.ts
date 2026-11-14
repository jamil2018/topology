import { test, expect } from "../fixtures";
import { caseStatusButton, createReadyCase, startManualRun } from "./run-flow";

test("failed result can create a mock issue", async ({ page }) => {
  test.setTimeout(60_000);
  const title = `E2E issue case ${Date.now()}`;
  await createReadyCase(page, title);
  await startManualRun(page, `E2E issue run ${Date.now()}`, [title]);

  await caseStatusButton(page, "failed").click();
  await expect(
    page.getByRole("button", { name: /^Failed \d+$/ }),
  ).toContainText("1");
  await page.getByRole("button", { name: /^Failed \d+$/ }).click();

  await expect(page.getByRole("button", { name: "Create issue" })).toBeVisible({
    timeout: 15_000,
  });
  await page.getByRole("button", { name: "Create issue" }).click();
  await expect(page.getByText(/MOCK-\d+/).first()).toBeVisible({
    timeout: 20_000,
  });
});
