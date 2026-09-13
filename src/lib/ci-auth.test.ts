import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateApiToken, hashToken } from "./ci-auth";

describe("hashToken", () => {
  it("returns sha256 hex of the token", () => {
    const token = "topo_demo_token_local_dev_only";
    expect(hashToken(token)).toBe(
      createHash("sha256").update(token).digest("hex"),
    );
  });
});

describe("generateApiToken", () => {
  it("creates topo_ tokens with matching prefix and hash", () => {
    const generated = generateApiToken();
    expect(generated.token).toMatch(/^topo_[a-f0-9]{48}$/);
    expect(generated.prefix).toBe(generated.token.slice(0, 12));
    expect(generated.hash).toBe(hashToken(generated.token));
  });

  it("generates unique tokens", () => {
    const a = generateApiToken();
    const b = generateApiToken();
    expect(a.token).not.toBe(b.token);
  });
});
