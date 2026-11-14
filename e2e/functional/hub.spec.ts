import { test, expect } from "../fixtures";

test("QA home shows assigned work and seeded milestone gate", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "My assigned runs" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Failing now" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Retest queue" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Overview" }).click();
  await expect(
    page.getByRole("heading", { name: "Overview" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Harbor 2.4 checkout gate" }),
  ).toBeVisible();
});
