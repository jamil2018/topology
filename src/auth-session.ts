import { createHash } from "node:crypto";

/** Fingerprint of `passwordHash` stored in the JWT. Not the hash itself. */
export function credentialStamp(
  passwordHash: string | null | undefined,
): string {
  return createHash("sha256")
    .update(passwordHash ?? "\0")
    .digest("hex");
}

/**
 * True when the JWT was issued for the current `passwordHash`.
 * A missing stamp fails closed so tokens minted before this claim existed
 * do not keep working after a password change.
 */
export function jwtMatchesCredentials(
  tokenVersion: unknown,
  passwordHash: string | null | undefined,
): boolean {
  return (
    typeof tokenVersion === "string" &&
    tokenVersion.length > 0 &&
    tokenVersion === credentialStamp(passwordHash)
  );
}

function headerMatchesOrigin(headerValue: string, targetOrigin: string): boolean {
  try {
    return new URL(headerValue).origin === targetOrigin;
  } catch {
    return false;
  }
}

/**
 * Cookie credential mutations must reject a cross-site Origin or Referer.
 * Same-origin is allowed. Missing both headers (non-browser clients) is allowed.
 */
export function isCrossSiteRequest(request: Request): boolean {
  let targetOrigin: string;
  try {
    targetOrigin = new URL(request.url).origin;
  } catch {
    return true;
  }

  const origin = request.headers.get("origin");
  if (origin !== null && !headerMatchesOrigin(origin, targetOrigin)) {
    return true;
  }

  const referer = request.headers.get("referer");
  if (referer !== null && !headerMatchesOrigin(referer, targetOrigin)) {
    return true;
  }

  return false;
}
