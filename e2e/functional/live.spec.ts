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


test("live reconnect reloads results missed during a closed stream", async ({ page, asAdmin }) => {
  test.setTimeout(60_000);
  const title = `Reconnect ${Date.now()}`;
  await createReadyCase(page, title);
  await startManualRun(page, `Reconnect run ${Date.now()}`, [title]);
  let attempts = 0;
  await asAdmin.route("**/api/live?*", async (route) => {
    attempts++;
    if (attempts === 1) await route.fulfill({ status: 200, contentType: "text/event-stream", body: "retry: 100\n\n" });
    else await route.abort("connectionfailed");
  });
  await asAdmin.goto(page.url());
  await expect(asAdmin.getByText("Reconnecting — results may be out of date", { exact: true })).toBeVisible();
  await caseStatusButton(page, "failed").click();
  await expect(page.getByRole("button", { name: /^Failed \d+$/ })).toContainText("1");
  await expect(asAdmin.getByRole("button", { name: /^Failed \d+$/ })).toContainText("0");
  await asAdmin.unroute("**/api/live?*");
  await expect(asAdmin.getByRole("button", { name: /^Failed \d+$/ })).toContainText("1", { timeout: 20_000 });
  await expect(asAdmin.getByText("Reconnecting — results may be out of date", { exact: true })).toHaveCount(0);
  expect(attempts).toBeGreaterThan(0);
});
