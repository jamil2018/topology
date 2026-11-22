import { describe, expect, it } from "vitest";
import {
  hubViewCookieName,
  parseHubViewPref,
  readHubViewCookie,
} from "./hub-view-pref";

describe("hub-view-pref", () => {
  it("parses overview vs default home", () => {
    expect(parseHubViewPref("overview")).toBe("overview");
    expect(parseHubViewPref("home")).toBe("home");
    expect(parseHubViewPref("other")).toBe("home");
    expect(parseHubViewPref(undefined)).toBe("home");
  });

  it("names and reads the per-project cookie", () => {
    expect(hubViewCookieName("proj-1")).toBe("topology-hub-view-proj-1");
    expect(
      readHubViewCookie({ get: () => undefined }, "proj-1"),
    ).toBeNull();
    expect(
      readHubViewCookie(
        { get: () => ({ value: "overview" }) },
        "proj-1",
      ),
    ).toBe("overview");
    expect(
      readHubViewCookie({ get: () => ({ value: "nope" }) }, "proj-1"),
    ).toBeNull();
  });
});
