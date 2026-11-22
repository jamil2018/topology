import { strFromU8, unzipSync } from "fflate";
import { test, expect } from "../fixtures";

test("open a seeded report and download its CSV export", async ({
  page,
  browser,
}) => {
  await page.goto("/reports");
  await expect(
    page.getByRole("heading", { name: "Reports", level: 1, exact: true }),
  ).toBeVisible();
  await expect(page.locator("main section").first().getByText("Pass rate", { exact: true })).toBeVisible();

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
  const csvText = await exported.text();
  expect(exported.headers()["content-type"]).toContain("text/csv");
  expect(csvText).toContain("Case,Title,Status");
  expect(csvText).toMatch(/HAR-\d+/);
  expect(csvText).toMatch(/passed|failed|blocked/);

  const xlsxHref = await page.getByRole("link", { name: "xlsx", exact: true }).getAttribute("href");
  const workbook = await page.request.get(xlsxHref!);
  expect(workbook.status()).toBe(200);
  expect(workbook.headers()["content-type"]).toBe("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const sheet = strFromU8(unzipSync(await workbook.body())["xl/worksheets/sheet1.xml"]);
  expect(sheet).toContain("Case");
  expect(sheet).toMatch(/HAR-\d+/);
  expect(sheet.match(/<row /g)?.length).toBe(csvText.trim().split("\n").length);
  const pdfHref = await page.getByRole("link", { name: "pdf", exact: true }).getAttribute("href");
  const pdfResponse = await page.request.get(pdfHref!);
  expect(pdfResponse.status()).toBe(200);
  const pdf = (await pdfResponse.body()).toString("latin1");
  expect(pdf).toMatch(/^%PDF-/);
  expect(pdf).toContain("Harbor smoke");
  expect(pdf).toMatch(/HAR-\d+/);

  await page.getByRole("button", { name: "Share link", exact: true }).click();
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
    const guestCsv = await guestPage.request.get(`${new URL(shareUrl).origin}/api/share/reports/${shareUrl.split("/").at(-1)}/export?format=csv`);
    expect(guestCsv.status()).toBe(200);
    expect(await guestCsv.text()).toBe(csvText);
    await page.getByRole("button", { name: "Revoke all share links" }).click();
    await expect(page.getByRole("status")).toHaveText("All earlier share links revoked.");
    await guestPage.reload();
    await expect(guestPage.getByText("Shared report · read only")).toHaveCount(0);
    const token = shareUrl.split("/").at(-1);
    for (const format of ["csv", "xlsx", "pdf"]) {
      expect((await guestPage.request.get(`${new URL(shareUrl).origin}/api/share/reports/${token}/export?format=${format}`)).status()).toBe(403);
    }
    await page.reload();
    await page.getByRole("button", { name: "Share link", exact: true }).click();
    const freshUrl = await page.getByLabel("Shareable report URL").inputValue();
    expect(freshUrl).not.toBe(shareUrl);
    await guestPage.goto(freshUrl);
    await expect(guestPage.getByText("Shared report · read only")).toBeVisible();
  } finally {
    await guest.close();
  }
});
