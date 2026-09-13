import { describe, expect, it } from "vitest";
import {
  isLegacySettingsSection,
  resolveSettingsSection,
  settingsHref,
} from "./settings-sections";

describe("settings-sections", () => {
  it("defaults to account", () => {
    expect(resolveSettingsSection(null)).toEqual({ page: "account" });
    expect(resolveSettingsSection(undefined)).toEqual({ page: "account" });
    expect(resolveSettingsSection("nope")).toEqual({ page: "account" });
  });

  it("maps legacy tabs onto merged pages with anchors", () => {
    expect(resolveSettingsSection("profile")).toEqual({
      page: "account",
      anchor: "profile",
    });
    expect(resolveSettingsSection("preferences")).toEqual({
      page: "account",
      anchor: "preferences",
    });
    expect(resolveSettingsSection("members")).toEqual({
      page: "access",
      anchor: "members",
    });
    expect(resolveSettingsSection("roles")).toEqual({
      page: "access",
      anchor: "roles",
    });
    expect(resolveSettingsSection("connections")).toEqual({
      page: "integrations",
      anchor: "connections",
    });
    expect(resolveSettingsSection("ci")).toEqual({
      page: "integrations",
      anchor: "ci",
    });
    expect(resolveSettingsSection("webhooks")).toEqual({
      page: "integrations",
      anchor: "webhooks",
    });
  });

  it("accepts canonical page ids", () => {
    expect(resolveSettingsSection("projects")).toEqual({ page: "projects" });
    expect(resolveSettingsSection("access")).toEqual({ page: "access" });
    expect(resolveSettingsSection("integrations")).toEqual({
      page: "integrations",
    });
  });

  it("builds hrefs and detects legacy sections", () => {
    expect(settingsHref("integrations", "ci")).toBe(
      "/settings?section=integrations#ci",
    );
    expect(isLegacySettingsSection("ci")).toBe(true);
    expect(isLegacySettingsSection("integrations")).toBe(false);
  });
});
