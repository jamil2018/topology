import { expect, STORAGE_STATE, test } from "../fixtures";

test.use({ storageState: STORAGE_STATE.admin });

const PAYLOADS = [
  "<script>alert(1)</script>",
  '"><img src=x onerror=alert(1)>',
] as const;

test("case titles are stored as data and not raw markup", async ({ page }) => {
  const stamp = Date.now().toString(36);

  for (const [index, title] of PAYLOADS.entries()) {
    const key = `XSS${stamp}${index}`.slice(0, 64);
    const created = await page.request.post("/api/cases", {
      data: {
        key,
        title,
        priority: "P3",
        status: "draft",
      },
    });
    const createdRaw = await created.text();
    expect(created.status(), createdRaw).toBe(201);
    const createdBody = JSON.parse(createdRaw) as {
      case: { id: string; title: string };
    };
    expect(createdBody.case.title).toBe(title);

    const fetched = await page.request.get(`/api/cases/${createdBody.case.id}`);
    const fetchedRaw = await fetched.text();
    expect(fetched.ok(), fetchedRaw).toBeTruthy();
    const fetchedBody = JSON.parse(fetchedRaw) as { case: { title: string } };
    expect(fetchedBody.case.title).toBe(title);

    await page.goto(`/cases?q=${encodeURIComponent(key)}`);
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
    const html = await page.content();
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
  }
});
