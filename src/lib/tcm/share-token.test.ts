import { describe, expect, it } from "vitest";
import { matchesShareGeneration, signShareToken, verifyShareToken } from "./share-token";

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

// Fixed clock keeps boundary and legacy checks repeatable.
describe("report share revocation generations", () => {
  const input = { ...payload, exp: 2_000_000 };
  it("treats legacy tokens as generation zero and rejects every earlier generation", () => {
    expect(matchesShareGeneration({ v: 1, ...input }, 0)).toBe(true);
    expect(matchesShareGeneration({ v: 1, ...input }, 1)).toBe(false);
    expect(matchesShareGeneration({ v: 1, ...input, generation: 1 }, 2)).toBe(false);
    const verified = verifyShareToken(signShareToken({ ...input, generation: 2 }, secret), secret, 1_000_000);
    expect(verified).toEqual({ ok: true, payload: { v: 1, ...input, generation: 2 } });
    expect(matchesShareGeneration({ v: 1, ...input, generation: 2 }, 2)).toBe(true);
  });
  it.each([-1, 0.5, Number.MAX_SAFE_INTEGER + 1])("rejects invalid signed generation %s", (generation) => {
    expect(verifyShareToken(signShareToken({ ...input, generation }, secret), secret, 1_000_000).ok).toBe(false);
  });
  it("expires exactly at the deadline and validates signed identifiers", () => {
    expect(verifyShareToken(signShareToken(input, secret), secret, input.exp)).toEqual({ ok: false, error: "Share link expired" });
    expect(verifyShareToken(signShareToken({ ...input, workspaceId: "bad-id" }, secret), secret, 0).ok).toBe(false);
  });
});
