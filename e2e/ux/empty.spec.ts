import { expect, test } from "../fixtures";

const NO_MATCH = "No cases match this search or folder.";
test("cases search with no matches shows the empty copy", async ({ page }) => {
  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();

  await page.getByRole("textbox", { name: "Search cases" }).fill(
    "zzzz-no-match-topology-ux",
  );
  await expect(
    page.getByText(NO_MATCH, { exact: true }).locator("visible=true"),
  ).toBeVisible();
});
