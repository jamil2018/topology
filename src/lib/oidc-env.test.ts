import { describe, expect, it } from "vitest";
import { oidcProviderConfigured, oidcProviderName } from "./oidc-env";

describe("oidc env", () => {
  it("requires issuer, id, and secret", () => {
    expect(oidcProviderConfigured({})).toBe(false);
    expect(
      oidcProviderConfigured({
        AUTH_OIDC_ISSUER: "https://idp.example",
        AUTH_OIDC_ID: "id",
      }),
    ).toBe(false);
    expect(
      oidcProviderConfigured({
        AUTH_OIDC_ISSUER: "https://idp.example",
        AUTH_OIDC_ID: "id",
        AUTH_OIDC_SECRET: "secret",
      }),
    ).toBe(true);
  });

  it("defaults the button name to OIDC", () => {
    expect(oidcProviderName({})).toBe("OIDC");
    expect(oidcProviderName({ AUTH_OIDC_NAME: "Authentik" })).toBe("Authentik");
  });
});
