import { test, expect } from "../fixtures";

test("quality graph preference reveals Intents and Releases", async ({
  page,
}) => {
  const nav = () => page.getByRole("navigation", { name: "Primary" });
  const intents = () =>
    nav().getByRole("link", { name: "Intents", exact: true });

  try {
    await page.goto("/settings?section=account");
    await expect(
      page.getByRole("heading", { name: "Preferences" }),
    ).toBeVisible();

    const toggle = page.getByRole("button", {
      name: /^Quality graph (on|off)$/,
    });
    await expect(toggle).toBeVisible();
    if ((await toggle.innerText()).includes("off")) {
      await expect(intents()).toHaveCount(0);
      const saved = page.waitForResponse(
        (res) =>
          res.url().includes("/api/workspace/preferences") &&
          res.request().method() === "PATCH" &&
          res.ok(),
      );
      await toggle.click();
      await saved;
    }

    await expect(
      page.getByRole("button", { name: "Quality graph on" }),
    ).toBeVisible();
    await expect(intents()).toBeVisible();

    await intents().click();
    await expect(
      page.getByRole("heading", { name: "Test Intents" }),
    ).toBeVisible();

    await nav().getByRole("link", { name: "Releases", exact: true }).click();
    await expect(
      page.getByRole("heading", { name: "Releases" }),
    ).toBeVisible();
  } finally {
    await page.request.patch("/api/workspace/preferences", {
      data: { qualityGraphEnabled: false },
    });
  }
});
