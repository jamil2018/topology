import { test, expect } from "../fixtures";

test("milestones page shows the seeded Harbor gate", async ({ page }) => {
  await page.goto("/milestones");
  await expect(page.getByRole("heading", { name: "Milestones" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Harbor 2.4 checkout gate" }),
  ).toBeVisible();
  await expect(
    page.getByText("Smoke and checkout suites must stay green for launch."),
  ).toBeVisible();
});
