import { test, expect } from "../fixtures";
import { caseStatusButton, createReadyCase, startManualRun } from "./run-flow";

test("a result recorded in one session appears in another via live updates", async ({
  page,
  asAdmin,
}) => {
  test.setTimeout(60_000);
  const title = `E2E live case ${Date.now()}`;
  await createReadyCase(page, title);
  await startManualRun(page, `E2E live run ${Date.now()}`, [title]);

  const live = asAdmin.waitForResponse(
    (res) => res.url().includes("/api/live") && res.ok(),
  );
  await asAdmin.goto(page.url());
  await live;
  await expect(asAdmin.getByRole("heading", { name: /E2E live run/ })).toBeVisible();
  await expect(
    asAdmin.getByRole("button", { name: /^Failed \d+$/ }),
  ).toContainText("0");

  await caseStatusButton(page, "failed").click();
  await expect(
    page.getByRole("button", { name: /^Failed \d+$/ }),
  ).toContainText("1");
  await expect(
    asAdmin.getByRole("button", { name: /^Failed \d+$/ }),
  ).toContainText("1", { timeout: 15_000 });
});
