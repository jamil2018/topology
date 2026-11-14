import { test, expect, CASE_KEYS } from "../fixtures";

test("demo admin sees Harbor and Harbor Beta in the project switcher", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();

  await page.getByRole("button", { name: "Harbor", exact: true }).click();
  const listbox = page.getByRole("listbox");
  await expect(
    listbox.getByRole("option", { name: /Harbor Beta/ }),
  ).toBeVisible();
  await expect(
    listbox.getByRole("option").filter({ hasText: "Harbor" }).filter({
      hasNotText: "Beta",
    }),
  ).toHaveCount(1);
  await expect(
    listbox.getByRole("option", { name: /Foreign Project/ }),
  ).toHaveCount(0);
});

test("member does not see Harbor Beta cases", async ({ asMember }) => {
  await asMember.goto("/");
  await expect(
    asMember.getByRole("heading", { name: "Home" }),
  ).toBeVisible();
  await asMember.getByRole("button", { name: "Harbor", exact: true }).click();
  await expect(asMember.getByRole("option")).toHaveCount(1);
  await expect(
    asMember.getByRole("option", { name: /Harbor Beta/ }),
  ).toHaveCount(0);

  await asMember.goto("/cases");
  await expect(
    asMember.getByRole("heading", { name: "Test cases" }),
  ).toBeVisible();
  await asMember.getByLabel("Search cases").filter({visible:true}).fill(CASE_KEYS.harborBeta);
  await expect(
    asMember.getByRole("cell", { name: "No cases match this search or folder." }),
  ).toBeVisible();
  await expect(asMember.getByText(CASE_KEYS.harborBeta)).toHaveCount(0);
});
