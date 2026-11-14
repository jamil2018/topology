import { test, expect } from "../fixtures";

test("open a seeded report and download its CSV export", async ({
  page,
  browser,
}) => {
  await page.goto("/reports");
  await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
  await expect(page.getByText("Pass rate", { exact: true })).toBeVisible();

  const reportLink = page.getByRole("link", { name: /Harbor smoke/ });
  await expect(reportLink).toBeVisible();
  await reportLink.click();
  await expect(
    page.getByRole("heading", { name: /Harbor smoke/ }),
  ).toBeVisible({ timeout: 15_000 });

  const csv = page.getByRole("link", { name: "csv", exact: true });
  await expect(csv).toBeVisible();
  const href = await csv.getAttribute("href");
  expect(href).toBeTruthy();
  const exported = await page.request.get(href!);
  expect(exported.ok()).toBeTruthy();
  expect((await exported.body()).byteLength).toBeGreaterThan(10);

  await page.getByRole("button", { name: "Share link" }).click();
  const share = page.getByLabel("Shareable report URL");
  await expect(share).toHaveValue(/\/share\/reports\//);
  const shareUrl = await share.inputValue();

  const guest = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const guestPage = await guest.newPage();
  try {
    await guestPage.goto(shareUrl);
    await expect(guestPage.getByText("Shared report · read only")).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      guestPage.getByRole("heading", { name: /Harbor smoke/ }),
    ).toBeVisible();
  } finally {
    await guest.close();
  }
});

test.fixme("revoked share links are not implemented — no revoke control or API for /share/reports/[token]", async () => {});
