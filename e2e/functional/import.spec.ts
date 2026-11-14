import path from "node:path";
import { test, expect } from "../fixtures";

const importDir = path.join(process.cwd(), "fixtures", "import");

async function previewFile(
  page: import("@playwright/test").Page,
  provider: string,
  fileName: string,
) {
  await page.getByRole("button", { name: provider, exact: true }).click();
  await page
    .getByLabel("Vendor export file")
    .setInputFiles(path.join(importDir, fileName));
  await expect(page.getByText(fileName)).toBeVisible();
  await page.getByRole("button", { name: "Preview mapping" }).click();
}

test("TestRail CSV previews and dry-runs without writing", async ({ page }) => {
  await page.goto("/cases/import");
  await expect(
    page.getByRole("heading", { name: "Import cases" }),
  ).toBeVisible();

  await previewFile(page, "TestRail", "testrail.csv");
  await expect(page.getByText("Checkout with saved card")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByText(/\d+\/\d+ valid/)).toBeVisible();

  await page.getByRole("button", { name: "Dry run" }).click();
  await expect(page.getByText("Nothing was written.")).toBeVisible({
    timeout: 15_000,
  });
});

test("Qase CSV previews mapped case titles", async ({ page }) => {
  await page.goto("/cases/import");
  await expect(
    page.getByRole("heading", { name: "Import cases" }),
  ).toBeVisible();

  await previewFile(page, "Qase", "qase.csv");
  await expect(page.getByText("Search products")).toBeVisible({
    timeout: 15_000,
  });
});
