import { createHash } from "node:crypto";

export type FailureSignatureInput = {
  errorMessage?: string | null;
  stack?: string | null;
  /** Fallback when message/stack are empty (e.g. triage notes). */
  notes?: string | null;
};

export type FailureSignature = {
  /** Stable sha256 hex of normalized message + stack top. */
  hash: string;
  normalizedMessage: string;
  stackTop: string;
};

export type SignatureClusterMember = {
  id: string;
  signatureHash: string;
  errorMessage?: string | null;
  stack?: string | null;
  notes?: string | null;
  failedAt?: Date | string | null;
};

export type FailureSignatureCluster = {
  signatureHash: string;
  normalizedMessage: string;
  stackTop: string;
  count: number;
  memberIds: string[];
  /** Newest failure timestamp in the cluster, when available. */
  lastFailedAt: Date | string | null;
};

/**
 * Collapse whitespace, strip hex/uuid/numeric noise, lowercase.
 */
export function normalizeErrorMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/\r\n/g, "\n")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/\b0x[0-9a-f]+\b/gi, "<hex>")
    .replace(/\d+/g, "<n>")
    .replace(/\s+/g, " ")
    .slice(0, 240);
}

/**
 * First meaningful stack frame (skips blank / "Error:" header lines).
 */
export function stackTopFrame(stack: string): string {
  const lines = stack.replace(/\r\n/g, "\n").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(error|typeerror|referenceerror|aggregateerror)\b/i.test(line)) {
      continue;
    }
    const frame = line
      .replace(/\([^)]*:\d+:\d+\)/g, "(…)")
      .replace(/:\d+:\d+\b/g, ":<n>:<n>")
      .replace(/\s+/g, " ")
      .slice(0, 200)
      .toLowerCase();
    if (frame) return frame;
  }
  return "";
}

function sourceText(input: FailureSignatureInput): {
  normalizedMessage: string;
  stackTop: string;
} {
  const rawMessage =
    input.errorMessage?.trim() ||
    input.notes?.trim().split("\n")[0]?.trim() ||
    "";
  const normalizedMessage = rawMessage
    ? normalizeErrorMessage(rawMessage)
    : "";
  const stackTop = input.stack?.trim()
    ? stackTopFrame(input.stack)
    : "";
  return { normalizedMessage, stackTop };
}

/**
 * Hash of normalized error message + stack top frame.
 * Empty inputs still produce a stable hash of the empty payload.
 */
export function computeFailureSignature(
  input: FailureSignatureInput,
): FailureSignature {
  const { normalizedMessage, stackTop } = sourceText(input);
  const payload = `${normalizedMessage}\n${stackTop}`;
  const hash = createHash("sha256").update(payload).digest("hex");
  return { hash, normalizedMessage, stackTop };
}

/** Convenience alias for callers that only need the fingerprint hash. */
export function failureSignatureHash(input: FailureSignatureInput): string {
  return computeFailureSignature(input).hash;
}

/**
 * Group failures that share the same normalized signature hash.
 * Clusters are ranked by count (desc), then newest lastFailedAt.
 */
export function clusterFailuresBySignature(
  members: SignatureClusterMember[],
): FailureSignatureCluster[] {
  const groups = new Map<
    string,
    {
      signature: FailureSignature;
      memberIds: string[];
      lastFailedAt: Date | string | null;
      lastFailedMs: number;
    }
  >();

  for (const member of members) {
    const signature = computeFailureSignature(member);
    // Prefer explicit hash when provided so persisted signature ids stay stable.
    const hash = member.signatureHash || signature.hash;
    const existing = groups.get(hash);
    const failedMs = member.failedAt
      ? new Date(member.failedAt).getTime()
      : Number.NaN;

    if (!existing) {
      groups.set(hash, {
        signature: { ...signature, hash },
        memberIds: [member.id],
        lastFailedAt: member.failedAt ?? null,
        lastFailedMs: Number.isFinite(failedMs) ? failedMs : -1,
      });
      continue;
    }

    existing.memberIds.push(member.id);
    if (Number.isFinite(failedMs) && failedMs > existing.lastFailedMs) {
      existing.lastFailedAt = member.failedAt ?? null;
      existing.lastFailedMs = failedMs;
    }
    if (
      !existing.signature.normalizedMessage &&
      signature.normalizedMessage
    ) {
      existing.signature.normalizedMessage = signature.normalizedMessage;
    }
    if (!existing.signature.stackTop && signature.stackTop) {
      existing.signature.stackTop = signature.stackTop;
    }
  }

  return [...groups.values()]
    .map((g) => ({
      signatureHash: g.signature.hash,
      normalizedMessage: g.signature.normalizedMessage,
      stackTop: g.signature.stackTop,
      count: g.memberIds.length,
      memberIds: g.memberIds,
      lastFailedAt: g.lastFailedAt,
    }))
    .sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const aMs = a.lastFailedAt ? new Date(a.lastFailedAt).getTime() : 0;
      const bMs = b.lastFailedAt ? new Date(b.lastFailedAt).getTime() : 0;
      return bMs - aMs;
    });
}
