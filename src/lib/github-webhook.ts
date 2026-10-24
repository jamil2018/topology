import { createHmac, timingSafeEqual } from "node:crypto";

export const TOPOLOGY_CHANGED_FILES_HEADER = "x-topology-changed-files";

/** Prefer a per-repository secret; fall back to the process-wide env secret. */
export function resolveGithubWebhookSecret(
  repoSecret: string | null | undefined,
  envSecret: string | null | undefined = process.env.TOPOLOGY_GITHUB_WEBHOOK_SECRET,
): string | undefined {
  const fromRepo = repoSecret?.trim();
  if (fromRepo) return fromRepo;
  const fromEnv = envSecret?.trim();
  return fromEnv || undefined;
}

export function githubPayloadRemoteUrl(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const repository = (payload as { repository?: unknown }).repository;
  if (!repository || typeof repository !== "object") return null;
  const cloneUrl = (repository as { clone_url?: unknown }).clone_url;
  const htmlUrl = (repository as { html_url?: unknown }).html_url;
  const raw =
    (typeof cloneUrl === "string" && cloneUrl.trim()) ||
    (typeof htmlUrl === "string" && htmlUrl.trim()) ||
    "";
  return raw ? raw.replace(/\/+$/, "") : null;
}

export function verifyGithubSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined,
): { ok: true } | { ok: false; status: number; error: string } {
  if (!secret?.trim()) {
    return { ok: false, status: 401, error: "Webhook secret is not configured" };
  }
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
