import { describe, expect, it } from "vitest";
import {
  formatChannelMessage,
  mergeChannelConfigJson,
  scrubChannelConfig,
  validateChannelConfig,
} from "./notification-channels";

describe("notification-channels helpers", () => {
  it("validates slack/teams webhook URLs", () => {
    expect(
      validateChannelConfig("slack", {
        url: "https://hooks.slack.com/services/T/B/X",
      }),
    ).toBeNull();
    expect(validateChannelConfig("slack", { url: "" })).toMatch(/required/i);
    expect(
      validateChannelConfig("teams", { url: "http://127.0.0.1/hook" }),
    ).toMatch(/private|local/i);
  });

  it("validates smtp config", () => {
    expect(
      validateChannelConfig("smtp", {
        host: "smtp.example.com",
        from: "topology@example.com",
      }),
    ).toBeNull();
    expect(validateChannelConfig("smtp", { host: "", from: "a@b.co" })).toMatch(
      /host/i,
    );
  });

  it("scrubs secrets from channel config", () => {
    expect(
      scrubChannelConfig("slack", {
        url: "https://hooks.slack.com/services/T/B/secret",
      }),
    ).toEqual({ hasUrl: true });
    expect(
      scrubChannelConfig("smtp", {
        host: "smtp.example.com",
        port: 587,
        user: "u",
        pass: "secret",
        from: "a@b.co",
        to: "qa@b.co",
      }),
    ).toMatchObject({
      host: "smtp.example.com",
      from: "a@b.co",
      to: "qa@b.co",
      hasPass: true,
    });
  });

  it("merges patch config without clearing secrets on blank fields", () => {
    const existing = JSON.stringify({
      url: "https://hooks.slack.com/services/T/B/keep",
    });
    expect(mergeChannelConfigJson("slack", existing, { url: "" })).toBe(
      JSON.stringify({ url: "https://hooks.slack.com/services/T/B/keep" }),
    );

    const smtpExisting = JSON.stringify({
      host: "smtp.example.com",
      port: 587,
      from: "a@b.co",
      pass: "keep-me",
      to: "qa@b.co",
    });
    const merged = JSON.parse(
      mergeChannelConfigJson("smtp", smtpExisting, {
        to: "ops@b.co",
        pass: "",
      }),
    ) as Record<string, unknown>;
    expect(merged.pass).toBe("keep-me");
    expect(merged.to).toBe("ops@b.co");
  });

  it("formats channel messages", () => {
    const assignment = formatChannelMessage("assignment", {
      title: "Run assigned: Smoke",
      body: "Open the run",
      entityType: "run",
      entityId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    });
    expect(assignment.title).toContain("Smoke");
    expect(assignment.href).toContain("/runs/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    const completed = formatChannelMessage("run.completed", {
      run: { id: "r1", name: "Nightly" },
      summary: { total: 10, passed: 9, failed: 1 },
    });
    expect(completed.title).toContain("Nightly");
    expect(completed.body).toContain("9 passed");
  });
});
