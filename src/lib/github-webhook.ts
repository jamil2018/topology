import { createHmac, timingSafeEqual } from "node:crypto";

export const TOPOLOGY_CHANGED_FILES_HEADER = "x-topology-changed-files";

export function verifyGithubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!secret?.trim()) return { ok: true };
  if (!signatureHeader?.startsWith("sha256=")) {
    return { ok: false, status: 401, error: "Missing X-Hub-Signature-256" };
  }
  const expected = createHmac("sha256", secret)
    .update(rawBody, "utf8")
    .digest("hex");
  const provided = signatureHeader.slice("sha256=".length);
  try {
    const a = Buffer.from(expected, "hex");
    const b = Buffer.from(provided, "hex");
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return { ok: false, status: 401, error: "Invalid webhook signature" };
    }
  } catch {
    return { ok: false, status: 401, error: "Invalid webhook signature" };
  }
  return { ok: true };
}

export function parseTopologyChangedFilesHeader(
  value: string | null,
): string[] {
  if (!value?.trim()) return [];
  const trimmed = value.trim();
  if (trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(
        (p): p is string => typeof p === "string" && p.trim().length > 0,
      );
    } catch {
      return [];
    }
  }
  return trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
}

export function githubPullRequestStatus(
  action: string,
  merged: boolean,
  draft: boolean,
): "open" | "closed" | "merged" | "draft" {
  if (draft) return "draft";
  if (merged) return "merged";
  if (action === "closed") return "closed";
  return "open";
}

export function collectGithubCommitPaths(commit: {
  added?: string[];
  modified?: string[];
  removed?: string[];
}): string[] {
  return [
    ...(commit.added ?? []),
    ...(commit.modified ?? []),
    ...(commit.removed ?? []),
  ];
}
