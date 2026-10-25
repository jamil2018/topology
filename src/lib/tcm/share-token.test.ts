import { describe, expect, it } from "vitest";
import { signShareToken, verifyShareToken } from "./share-token";

const secret = "test-share-secret";
const payload = {
  kind: "run" as const,
  workspaceId: "11111111-1111-1111-1111-111111111111",
  targetId: "22222222-2222-2222-2222-222222222222",
  exp: Date.now() + 60_000,
};

describe("share tokens", () => {
  it("round-trips a signed payload", () => {
    const token = signShareToken(payload, secret);
    const verified = verifyShareToken(token, secret);
    expect(verified.ok).toBe(true);
    if (verified.ok) {
      expect(verified.payload.kind).toBe("run");
      expect(verified.payload.targetId).toBe(payload.targetId);
    }
  });

  it("rejects tampering, wrong secret, and expiry", () => {
    const token = signShareToken(payload, secret);
    expect(verifyShareToken(token + "x", secret).ok).toBe(false);
    expect(verifyShareToken(token, "other-secret").ok).toBe(false);
    const expired = signShareToken({ ...payload, exp: Date.now() - 1 }, secret);
    const verified = verifyShareToken(expired, secret);
    expect(verified.ok).toBe(false);
    if (!verified.ok) expect(verified.error).toMatch(/expired/i);
  });
});
