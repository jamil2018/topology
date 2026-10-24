import { eq } from "drizzle-orm";
import { db } from "@/db";
import { loginRateLimits } from "@/db/schema";

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_MAX_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

export function loginRateLimitIdentifier(email: string, ip: string | null): string {
  const normalized = email.trim().toLowerCase();
  return ip ? `email:${normalized}|ip:${ip}` : `email:${normalized}`;
}

export type LoginRateLimitResult =
  | { blocked: false; remaining: number }
  | { blocked: true; retryAfterSec: number };

function remainingAttempts(count: number): number {
  return Math.max(0, LOGIN_MAX_ATTEMPTS - count);
}

export async function checkLoginRateLimit(
  identifier: string,
  now = new Date(),
): Promise<LoginRateLimitResult> {
  const row = await db.query.loginRateLimits.findFirst({
    where: eq(loginRateLimits.identifier, identifier),
  });
  if (!row) {
    return { blocked: false, remaining: LOGIN_MAX_ATTEMPTS };
  }

  if (row.lockedUntil && row.lockedUntil.getTime() > now.getTime()) {
    return {
      blocked: true,
      retryAfterSec: Math.max(
        1,
        Math.ceil((row.lockedUntil.getTime() - now.getTime()) / 1000),
      ),
    };
  }

  const windowExpired =
    now.getTime() - row.windowStartedAt.getTime() >= LOGIN_WINDOW_MS;
  if (windowExpired) {
    return { blocked: false, remaining: LOGIN_MAX_ATTEMPTS };
  }

  if (row.attemptCount >= LOGIN_MAX_ATTEMPTS) {
    const lockedUntil = new Date(now.getTime() + LOGIN_LOCKOUT_MS);
    await db
      .update(loginRateLimits)
      .set({ lockedUntil })
      .where(eq(loginRateLimits.identifier, identifier));
    return {
      blocked: true,
      retryAfterSec: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
    };
  }

  return { blocked: false, remaining: remainingAttempts(row.attemptCount) };
}

export async function recordLoginFailure(
  identifier: string,
  now = new Date(),
): Promise<LoginRateLimitResult> {
  const row = await db.query.loginRateLimits.findFirst({
    where: eq(loginRateLimits.identifier, identifier),
  });

  if (!row) {
    await db.insert(loginRateLimits).values({
      identifier,
      attemptCount: 1,
      windowStartedAt: now,
      lockedUntil: null,
    });
    return { blocked: false, remaining: remainingAttempts(1) };
  }

  const windowExpired =
    now.getTime() - row.windowStartedAt.getTime() >= LOGIN_WINDOW_MS;
  const nextCount = windowExpired ? 1 : row.attemptCount + 1;
  const locked =
    nextCount >= LOGIN_MAX_ATTEMPTS
      ? new Date(now.getTime() + LOGIN_LOCKOUT_MS)
      : null;

  await db
    .update(loginRateLimits)
    .set({
      attemptCount: nextCount,
      windowStartedAt: windowExpired ? now : row.windowStartedAt,
      lockedUntil: locked,
    })
    .where(eq(loginRateLimits.identifier, identifier));

  if (locked) {
    return {
      blocked: true,
      retryAfterSec: Math.ceil(LOGIN_LOCKOUT_MS / 1000),
    };
  }
  return { blocked: false, remaining: remainingAttempts(nextCount) };
}

export async function clearLoginRateLimit(identifier: string): Promise<void> {
  await db
    .delete(loginRateLimits)
    .where(eq(loginRateLimits.identifier, identifier));
}
