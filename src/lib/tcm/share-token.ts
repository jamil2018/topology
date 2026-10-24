import { createHmac, timingSafeEqual } from "node:crypto";

export type ReportSharePayload = {
  v: 1;
  kind: "run" | "milestone";
  workspaceId: string;
  targetId: string;
  exp: number;
};

function shareSecret(explicit?: string): string {
  const secret =
    explicit?.trim() ||
    process.env.AUTH_SECRET?.trim() ||
    process.env.TOPOLOGY_TOKEN_PEPPER?.trim() ||
    "";
  if (!secret) {
    throw new Error("AUTH_SECRET is required to sign report share links");
  }
  return secret;
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromB64url(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

export function signShareToken(
  payload: Omit<ReportSharePayload, "v">,
  secret?: string,
): string {
  const body: ReportSharePayload = { v: 1, ...payload };
  const encoded = b64url(JSON.stringify(body));
  const mac = createHmac("sha256", shareSecret(secret))
    .update(encoded)
    .digest();
  return `${encoded}.${b64url(mac)}`;
}

export function verifyShareToken(
  token: string,
  secret?: string,
  now = Date.now(),
): { ok: true; payload: ReportSharePayload } | { ok: false; error: string } {
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    return { ok: false, error: "Invalid share link" };
  }
  let expected: Buffer;
  try {
    expected = createHmac("sha256", shareSecret(secret))
      .update(parts[0])
      .digest();
  } catch {
    return { ok: false, error: "Share links are not configured" };
  }
  const actual = fromB64url(parts[1]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return { ok: false, error: "Invalid share link" };
  }
  try {
    const payload = JSON.parse(fromB64url(parts[0]).toString("utf8")) as ReportSharePayload;
    if (payload.v !== 1 || (payload.kind !== "run" && payload.kind !== "milestone")) {
      return { ok: false, error: "Invalid share link" };
    }
    if (!payload.workspaceId || !payload.targetId) {
      return { ok: false, error: "Invalid share link" };
    }
    if (typeof payload.exp !== "number" || payload.exp <= now) {
      return { ok: false, error: "Share link expired" };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "Invalid share link" };
  }
}

export const SHARE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
