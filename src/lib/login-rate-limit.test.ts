import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOGIN_LOCKOUT_MS,
  LOGIN_MAX_ATTEMPTS,
  loginRateLimitIdentifier,
} from "./login-rate-limit";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  insertValues: vi.fn(),
  updateWhere: vi.fn(),
  deleteWhere: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    query: {
      loginRateLimits: { findFirst: mocks.findFirst },
    },
    insert: () => ({ values: mocks.insertValues }),
    update: () => ({
      set: (values: Record<string, unknown>) => ({
        where: () => mocks.updateWhere(values),
      }),
    }),
    delete: () => ({ where: mocks.deleteWhere }),
  },
}));

describe("loginRateLimitIdentifier", () => {
  it("normalizes email and includes ip when present", () => {
    expect(loginRateLimitIdentifier("  A@B.com ", "1.1.1.1")).toBe(
      "email:a@b.com|ip:1.1.1.1",
    );
    expect(loginRateLimitIdentifier("a@b.com", null)).toBe("email:a@b.com");
  });
});

describe("login rate limit counters", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.insertValues.mockReset();
    mocks.updateWhere.mockReset();
    mocks.deleteWhere.mockReset();
    mocks.insertValues.mockResolvedValue(undefined);
    mocks.updateWhere.mockResolvedValue(undefined);
    mocks.deleteWhere.mockResolvedValue(undefined);
  });

  it("allows the first attempts and locks after the max", async () => {
    const { checkLoginRateLimit, recordLoginFailure } = await import(
      "./login-rate-limit"
    );
    mocks.findFirst.mockResolvedValue(undefined);
    expect(await checkLoginRateLimit("email:a@b.com")).toEqual({
      blocked: false,
      remaining: LOGIN_MAX_ATTEMPTS,
    });

    mocks.findFirst.mockResolvedValue({
      identifier: "email:a@b.com",
      attemptCount: LOGIN_MAX_ATTEMPTS - 1,
      windowStartedAt: new Date(),
      lockedUntil: null,
    });
    const after = await recordLoginFailure("email:a@b.com");
    expect(after.blocked).toBe(true);
    expect(mocks.updateWhere).toHaveBeenCalled();
  });

  it("locks one identifier on the fifth failure and keeps it locked", async () => {
    const { checkLoginRateLimit, recordLoginFailure } = await import(
      "./login-rate-limit"
    );
    const identifier = "email:lockout@example.com|ip:203.0.113.5";
    const now = new Date("2026-06-01T12:00:00.000Z");
    let row:
      | {
          identifier: string;
          attemptCount: number;
          windowStartedAt: Date;
          lockedUntil: Date | null;
        }
      | undefined;

    mocks.findFirst.mockImplementation(async () => row);
    mocks.insertValues.mockImplementation(async (values) => {
      row = values;
    });
    mocks.updateWhere.mockImplementation(async (values) => {
      row = { ...row!, ...values };
    });

    expect(await checkLoginRateLimit(identifier, now)).toEqual({
      blocked: false,
      remaining: LOGIN_MAX_ATTEMPTS,
    });

    for (let attempt = 1; attempt < LOGIN_MAX_ATTEMPTS; attempt += 1) {
      const result = await recordLoginFailure(identifier, now);
      expect(result.blocked).toBe(false);
      if (!result.blocked) {
        expect(result.remaining).toBe(LOGIN_MAX_ATTEMPTS - attempt);
      }
    }

    const locked = await recordLoginFailure(identifier, now);
    expect(locked).toEqual({
      blocked: true,
      retryAfterSec: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
    });
    expect(row?.attemptCount).toBe(LOGIN_MAX_ATTEMPTS);

    const duringLock = await checkLoginRateLimit(
      identifier,
      new Date(now.getTime() + 1000),
    );
    expect(duringLock.blocked).toBe(true);
  });

  it("blocks while lockedUntil is in the future", async () => {
    const { checkLoginRateLimit } = await import("./login-rate-limit");
    mocks.findFirst.mockResolvedValue({
      identifier: "email:a@b.com",
      attemptCount: LOGIN_MAX_ATTEMPTS,
      windowStartedAt: new Date(),
      lockedUntil: new Date(Date.now() + 60_000),
    });
    const result = await checkLoginRateLimit("email:a@b.com");
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.retryAfterSec).toBeGreaterThan(0);
    }
  });
});
