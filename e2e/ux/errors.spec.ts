import { expect, test } from "../fixtures";
import { ownedDatabase } from "../database";

// A real database failure reaches the server-component boundary. No application
// endpoint is added for fault injection. The harness database is verified first.
test("UX-ERR-001: server render failure shows the cases boundary and recovers", async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: "expected-page-error", description: "An error occurred in the Server Components render" });
  const sql = await ownedDatabase();
  let renamed = false;
  try {
    await sql`ALTER TABLE cases RENAME TO cases_validation_unavailable`;
    renamed = true;
    await page.goto("/cases");
    const alert = page.getByRole("alert");
    await expect(alert.getByRole("heading", { name: "Test cases couldn’t load" })).toBeVisible();
    await expect(alert.getByText("Unexpected error while loading this suite.")).toBeVisible();
    await sql`ALTER TABLE cases_validation_unavailable RENAME TO cases`;
    renamed = false;
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Test cases", exact: true })).toBeVisible();
  } finally {
    try { if (renamed) await sql`ALTER TABLE cases_validation_unavailable RENAME TO cases`; }
    finally { await sql.end(); }
  }
});
