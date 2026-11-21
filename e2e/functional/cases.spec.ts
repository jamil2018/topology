import { test, expect } from "../fixtures";

test("search, filter, create, edit, folder, saved view, and bulk tag", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const stamp = Date.now();
  const title = `E2E case ${stamp}`;
  const edited = `E2E case edited ${stamp}`;
  const folderName = `E2E folder ${stamp}`;
  const viewName = `E2E view ${stamp}`;
  const tag = `e2e-tag-${stamp}`;

  await page.goto("/cases");
  await expect(page.getByRole("heading", { name: "Test cases" })).toBeVisible();

  await page
    .getByLabel("Search cases").filter({visible:true})
    .fill("Shopper can open the storefront home");
  await expect(
    page.getByRole("button", { name: "Shopper can open the storefront home" }),
  ).toBeVisible();

  await page.getByLabel("Status", { exact: true }).filter({visible:true}).click();
  await page.getByRole("listbox").getByRole("option", { name: "Deprecated", exact: true }).click();
  await expect(
    page.getByText("No cases match this search or folder.").filter({visible:true}),
  ).toBeVisible();

  await page.getByLabel("Status", { exact: true }).filter({visible:true}).click();
  await page.getByRole("listbox").getByRole("option", { name: "Ready", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Shopper can open the storefront home" }),
  ).toBeVisible();

  await page.goto("/cases");
  await page.getByRole("button", { name: "New case" }).click();
  await expect(page.getByLabel("Title").filter({visible:true})).toBeVisible();
  await page.getByLabel("Title").filter({visible:true}).fill(title);
  await page.getByRole("button", { name: "Save case" }).click();

  await expect(page).toHaveURL(/\/cases\?case=.+/);
  const details = page.getByRole("dialog", {name:/^Case /});
  await expect(details.getByLabel("Title")).toHaveValue(title, {
    timeout: 15_000,
  });
  await details.getByLabel("Title").fill(edited);
  await expect(details.getByText("Unsaved changes")).toBeVisible();
  const save = details.getByRole("button", { name: "Save", exact: true });
  await expect(save).toBeEnabled();
  await save.scrollIntoViewIfNeeded();
  const caseSaved = page.waitForResponse(
    (response) =>
      /\/api\/cases\/[^/]+$/.test(new URL(response.url()).pathname) &&
      response.request().method() === "PATCH",
  );
  const [response] = await Promise.all([caseSaved, save.click()]);
  expect(response.ok()).toBeTruthy();
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Close case editor" }).click();
  await expect(
    page.getByText(edited, {exact:true}).filter({visible:true}),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("Search cases").filter({visible:true}).fill(edited);
  await page
    .getByRole("row")
    .filter({ hasText: edited })
    .getByRole("checkbox")
    .check();
  await expect(page.getByText("1 selected")).toBeVisible();
  await page.getByLabel("Add tags").filter({visible:true}).fill(tag);
  await page.getByRole("button", { name: "Add tags" }).click();
  await expect(page.getByText(tag, {exact:true}).filter({visible:true})).toBeVisible({ timeout: 15_000 });

  await page.getByRole("button", { name: "Save current" }).click();
  await page.getByLabel("View name").filter({visible:true}).fill(viewName);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    page.getByRole("button", { name: viewName, exact: true }),
  ).toBeVisible({ timeout: 15_000 });

  await page.getByLabel("Search cases").filter({visible:true}).fill("");
  await page.getByRole("button", { name: viewName, exact: true }).click();
  await expect(
    page.getByText(edited, {exact:true}).filter({visible:true}),
  ).toBeVisible();

  await page.getByRole("button", { name: "New folder" }).first().click();
  await expect(page.getByRole("heading", { name: "New folder" })).toBeVisible();
  await page.getByLabel("Folder name").filter({visible:true}).fill(folderName);
  await page.getByRole("button", { name: "Create folder" }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(`^${folderName}(?:\\s|$)`) }),
  ).toBeVisible({ timeout: 15_000 });
});
