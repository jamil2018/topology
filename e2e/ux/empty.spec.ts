import { expect, test } from "@playwright/test";

const NO_MATCH = "No cases match this search or folder.";
const NO_CASES_TITLE = "No cases yet";
const NO_CASES_DESCRIPTION =
  "Create the first case, then start a run, import CI, and file issues from triage.";

test("cases search with no matches shows the empty copy", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();

  const guided = page.getByRole("region", { name: "Guided first run" });
  if (await guided.isVisible()) {
    await expect(
      page.getByText(NO_CASES_TITLE, { exact: true }).locator("visible=true"),
    ).toBeVisible();
    await expect(
      page.getByText(NO_CASES_DESCRIPTION, { exact: true }).locator("visible=true"),
    ).toBeVisible();
    return;
  }

  await page.getByRole("textbox", { name: "Search cases" }).fill(
    "zzzz-no-match-topology-ux",
  );
  await expect(
    page.getByText(NO_MATCH, { exact: true }).locator("visible=true"),
  ).toBeVisible();
});
