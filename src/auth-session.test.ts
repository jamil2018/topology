import { describe, expect, it } from "vitest";
import {
  credentialStamp,
  isCrossSiteRequest,
  jwtMatchesCredentials,
} from "./auth-session";

const settingsUrl = "http://127.0.0.1:4317/api/settings";

function patch(headers: Record<string, string>) {
  return new Request(settingsUrl, { method: "PATCH", headers });
}

describe("isCrossSiteRequest", () => {
  it("allows same-origin and missing Origin on non-browser clients", () => {
    expect(isCrossSiteRequest(patch({}))).toBe(false);
    expect(
      isCrossSiteRequest(patch({ origin: "http://127.0.0.1:4317" })),
    ).toBe(false);
    expect(
      isCrossSiteRequest(
        patch({
          origin: "http://127.0.0.1:4317",
          referer: "http://127.0.0.1:4317/settings",
        }),
      ),
    ).toBe(false);
  });

  it("rejects a cross-site Origin or Referer", () => {
    expect(
      isCrossSiteRequest(patch({ origin: "https://evil.example" })),
    ).toBe(true);
    expect(
      isCrossSiteRequest(
        patch({ referer: "https://evil.example/csrf" }),
      ),
    ).toBe(true);
    expect(isCrossSiteRequest(patch({ origin: "null" }))).toBe(true);
    expect(
      isCrossSiteRequest(patch({ origin: "http://127.0.0.1:3000" })),
    ).toBe(true);
    expect(
      isCrossSiteRequest(patch({ origin: "http://localhost:4317" })),
    ).toBe(true);
    expect(
      isCrossSiteRequest(
        patch({
          origin: "http://127.0.0.1:4317",
          referer: "https://evil.example/csrf",
        }),
      ),
    ).toBe(true);
  });
});

describe("jwtMatchesCredentials", () => {
  it("matches only the stamp of the current password hash", () => {
    const current = credentialStamp("$2a$10$current");
    expect(jwtMatchesCredentials(current, "$2a$10$current")).toBe(true);
    expect(jwtMatchesCredentials(current, "$2a$10$rotated")).toBe(false);
    expect(jwtMatchesCredentials(undefined, "$2a$10$current")).toBe(false);
    expect(jwtMatchesCredentials("", null)).toBe(false);
    expect(credentialStamp(null)).toBe(credentialStamp(undefined));
  });
});
