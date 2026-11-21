import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  inboundIssueSigningStatus,
  parseInboundIssuePayload,
  verifyInboundIssueWebhook,
} from "./issue-inbound-webhooks";

describe("inbound issue webhook parsing", () => {
  it("maps GitHub closed issues to done", () => {
    const headers = new Headers({ "x-github-event": "issues" });
    const event = parseInboundIssuePayload(
      "github",
      {
        action: "closed",
        issue: {
          id: 42,
          number: 7,
          state: "closed",
          title: "Flaky cart",
          html_url: "https://github.com/acme/app/issues/7",
        },
      },
      headers,
    );
    expect(event).toMatchObject({
      remoteId: "42",
      remoteKey: "#7",
      remoteStatus: "done",
    });
  });

  it("maps Jira done status category to done", () => {
    const event = parseInboundIssuePayload(
      "jira",
      {
        issue: {
          id: "10001",
          key: "QA-9",
          fields: {
            summary: "Coupon math",
            status: { name: "Done", statusCategory: { key: "done" } },
          },
        },
      },
      new Headers(),
    );
    expect(event).toMatchObject({
      remoteId: "10001",
      remoteKey: "QA-9",
      remoteStatus: "done",
    });
  });
});

describe("inbound issue webhook verification", () => {
  it("accepts a valid GitHub signature", () => {
    const secret = "test-secret";
    const rawBody = '{"ok":true}';
    process.env.TOPOLOGY_GITHUB_WEBHOOK_SECRET = secret;
    const digest = createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("hex");
    const result = verifyInboundIssueWebhook({
      provider: "github",
      rawBody,
      headers: new Headers({
        "x-hub-signature-256": `sha256=${digest}`,
      }),
    });
    expect(result).toEqual({ ok: true });
  });
});

describe("inboundIssueSigningStatus", () => {
  it("reports per-provider webhook paths and signing readiness", () => {
    const rows = inboundIssueSigningStatus({
      TOPOLOGY_GITHUB_WEBHOOK_SECRET: "gh",
      TOPOLOGY_LINEAR_WEBHOOK_SECRET: "lin",
    } as NodeJS.ProcessEnv);
    expect(rows).toHaveLength(4);
    expect(rows.find((r) => r.provider === "github")).toMatchObject({
      path: "/api/webhooks/issues/github",
      signingConfigured: true,
    });
    expect(rows.find((r) => r.provider === "gitlab")).toMatchObject({
      signingConfigured: false,
    });
    expect(rows.find((r) => r.provider === "linear")?.signingConfigured).toBe(
      true,
    );
  });
});
