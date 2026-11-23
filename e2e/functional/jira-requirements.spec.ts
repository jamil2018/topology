import { createHmac } from "node:crypto";
import { expect, test } from "../fixtures";

test("Jira revisions require renewed coverage review through real HTTP and the keyboard", async ({ page, playwright, baseURL }) => {
  const projectId = process.env.TOPOLOGY_VALIDATION_JIRA_PROJECT;
  const secret = process.env.TOPOLOGY_JIRA_REQUIREMENT_SECRET_VALIDATION;
  expect(projectId, "Harness must configure the isolated Jira project").toBeTruthy();
  expect(Boolean(secret), "Harness must configure the signing secret").toBe(true);
  const intentResponse = await page.request.post("/api/intents", {
    data: { key: "JIRA-INT", title: "Check checkout recovery" },
  });
  expect(intentResponse.status()).toBe(201);
  const { intent } = await intentResponse.json();
  const created = await page.request.post("/api/requirements", {
    data: { key: "JIRA-REQ", title: "Local checkout requirement" },
  });
  expect(created.status()).toBe(201);
  const { requirement } = await created.json();
  const linked = await page.request.patch("/api/requirements", {
    data: { id: requirement.id, coversIntentIds: [intent.id] },
  });
  expect(linked.status()).toBe(200);

  const issueId = "10222";
  const path = `/api/requirements/${requirement.id}/jira`;
  const requirementPage = `/requirements?requirement=${requirement.id}`;
  const jira = page.getByRole("region", { name: "Jira coverage" });
  const review = jira.getByRole("button", { name: "Confirm coverage for JIRA-INT" });
  const incoming = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  async function deliver(updated: string, summary: string) {
    const data = JSON.stringify({
      webhookEvent: "jira:issue_updated",
      issue: { id: issueId, key: "CART-12", self: `https://validation.atlassian.net/rest/api/2/issue/${issueId}`,
        fields: { project: { id: "10001" }, updated, summary, description: "Recover an interrupted checkout." } },
    });
    const mac = createHmac("sha256", secret!).update(data).digest("hex");
    return incoming.post(`/api/webhooks/requirements/jira?workspaceId=${projectId}`, {
      data, headers: { "x-hub-signature": `sha256=${mac}`, "content-type": "application/json" },
    });
  }

  try {
    await page.goto(requirementPage);
    await page.getByRole("textbox", { name: "Jira issue ID" }).fill(issueId);
    await page.getByRole("button", { name: "Link Jira issue" }).press("Enter");
    await expect(jira).toContainText("Waiting for Jira");

    const first = await deliver("2026-01-25T00:00:00.000Z", "Review checkout");
    expect(first.status()).toBe(200);
    expect(await first.json()).toEqual({ status: "updated", revision: 1 });
    await page.reload();
    await expect(jira).toContainText("Revision 1");
    await review.press("Enter");
    await expect(review).toHaveCount(0);

    const second = await deliver("2026-01-25T00:02:00.000Z", "Review checkout after disconnect");
    expect(second.status()).toBe(200);
    expect(await second.json()).toEqual({ status: "updated", revision: 2 });
    await page.reload();
    await expect(jira).toContainText("Revision 2");
    await expect(review).toBeVisible();

    const list = await page.request.get("/api/requirements");
    expect(list.status()).toBe(200);
    const row = (await list.json()).requirements.find((entry: { id: string }) => entry.id === requirement.id);
    expect(row.coverageLinks).toEqual([expect.objectContaining({ suspect: true, reviewedJiraRevision: 1 })]);
    const { edgeId } = row.coverageLinks[0];
    const stale = await page.request.post(path, { data: { action: "review", edgeId, revision: 1 } });
    expect(stale.status()).toBe(409);
    await review.press("Enter");
    await expect(review).toHaveCount(0);
    await page.reload();
    await expect(jira).toContainText("Revision 2");
    await expect(review).toHaveCount(0);

    const history = await page.request.get(path);
    expect(history.status()).toBe(200);
    expect((await history.json()).revisions).toEqual([
      expect.objectContaining({ revision: 2, title: "Review checkout after disconnect" }),
      expect.objectContaining({ revision: 1, title: "Review checkout" }),
    ]);
  } finally {
    await incoming.dispose();
  }
});
