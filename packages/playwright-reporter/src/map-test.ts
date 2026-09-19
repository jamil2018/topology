import type {
  ExecutionArtifact,
  ExecutionResult,
  ExecutionStatus,
} from "@topology/domain";

/** Minimal Playwright shapes so unit tests need no full PW runtime. */
export type PlaywrightAnnotation = {
  type: string;
  description?: string;
};

export type PlaywrightAttachment = {
  name: string;
  path?: string;
  contentType?: string;
};

export type PlaywrightTestRef = {
  title: string;
  titlePath: string[];
  location?: { file: string; line: number; column: number };
  annotations?: PlaywrightAnnotation[];
};

export type PlaywrightResultRef = {
  status: "passed" | "failed" | "timedOut" | "interrupted" | "skipped";
  duration: number;
  error?: { message?: string; stack?: string };
  attachments?: PlaywrightAttachment[];
  retry?: number;
};

const INTENT_KEY_RE = /^\[?([A-Z][A-Z0-9]*-\d+)\]?(?:[:\s]|$)/;

const INTENT_ANNOTATION_TYPES = new Set([
  "intentKey",
  "intent",
  "topology.intentKey",
  "topology:intentKey",
]);

const EXTERNAL_ANNOTATION_TYPES = new Set([
  "externalKey",
  "topology.externalKey",
  "topology:externalKey",
]);

export function annotationValue(
  annotations: PlaywrightAnnotation[] | undefined,
  types: Set<string>,
): string | undefined {
  if (!annotations?.length) return undefined;
  for (const a of annotations) {
    if (types.has(a.type) && a.description?.trim()) {
      return a.description.trim();
    }
  }
  return undefined;
}

/** Pull INTENT-123 from titles like "AUTH-001: login" or "[AUTH-001] login". */
export function intentKeyFromTitle(title: string): string | undefined {
  const match = title.trim().match(INTENT_KEY_RE);
  return match?.[1];
}

export function defaultExternalKey(
  test: PlaywrightTestRef,
  projectRoot?: string,
): string {
  const file = relativize(test.location?.file ?? "unknown", projectRoot);
  const parts = test.titlePath.filter(Boolean);
  const head = parts[0]?.replace(/\\/g, "/");
  const dropFile =
    Boolean(head) &&
    (head === file ||
      head === file.split("/").pop() ||
      file.endsWith(head!) ||
      /\.(spec|test|m?[jt]sx?)$/i.test(head!));
  const titleParts = dropFile ? parts.slice(1) : parts;
  const title = titleParts.length > 0 ? titleParts.join(" › ") : test.title;
  return `${file}::${title}`;
}

function relativize(file: string, projectRoot?: string): string {
  if (!projectRoot) return file;
  const root = projectRoot.replace(/\/$/, "");
  if (file.startsWith(root + "/") || file.startsWith(root + "\\")) {
    return file.slice(root.length + 1).replace(/\\/g, "/");
  }
  return file.replace(/\\/g, "/");
}

export function mapStatus(
  status: PlaywrightResultRef["status"],
): ExecutionStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
    case "timedOut":
    case "interrupted":
      return "error";
    default:
      return "error";
  }
}

export function mapArtifactKind(
  name: string,
  contentType?: string,
): ExecutionArtifact["kind"] {
  const lower = name.toLowerCase();
  const ct = (contentType ?? "").toLowerCase();
  if (lower.includes("trace") || ct.includes("zip")) return "trace";
  if (lower.includes("video") || ct.startsWith("video/")) return "video";
  if (
    lower.includes("screenshot") ||
    ct.startsWith("image/") ||
    /\.(png|jpe?g|webp|gif)$/i.test(lower)
  ) {
    return "screenshot";
  }
  if (lower.includes("log") || ct.startsWith("text/")) return "log";
  return "other";
}

export function mapAttachments(
  attachments: PlaywrightAttachment[] | undefined,
): ExecutionArtifact[] {
  if (!attachments?.length) return [];
  return attachments
    .filter((a) => a.path || a.name)
    .map((a) => ({
      kind: mapArtifactKind(a.name, a.contentType),
      name: a.name || undefined,
      path: a.path || undefined,
      contentType: a.contentType || undefined,
    }));
}

export type MapTestOptions = {
  projectRoot?: string;
  /** When true (default), parse INTENT-123 from the leaf title. */
  intentFromTitle?: boolean;
  browser?: string;
  os?: string;
};

/**
 * Map a Playwright test + result into an ExecutionResult.
 * Preference: annotation intentKey → title prefix → externalKey only.
 */
export function mapPlaywrightResult(
  test: PlaywrightTestRef,
  result: PlaywrightResultRef,
  options: MapTestOptions = {},
): ExecutionResult {
  const annotations = test.annotations ?? [];
  const intentKey =
    annotationValue(annotations, INTENT_ANNOTATION_TYPES) ??
    (options.intentFromTitle !== false
      ? intentKeyFromTitle(test.title)
      : undefined);
  const annotatedExternal = annotationValue(
    annotations,
    EXTERNAL_ANNOTATION_TYPES,
  );
  const externalKey =
    annotatedExternal ?? defaultExternalKey(test, options.projectRoot);

  const mapped: ExecutionResult = {
    status: mapStatus(result.status),
    durationMs: Math.max(0, result.duration),
    title: test.title,
    externalKey,
    artifacts: mapAttachments(result.attachments),
  };

  if (intentKey) mapped.intentKey = intentKey;
  if (result.error?.message) mapped.errorMessage = result.error.message;
  if (result.error?.stack) mapped.stack = result.error.stack;
  if (options.browser || options.os) {
    mapped.environment = {
      ...(options.browser ? { browser: options.browser } : {}),
      ...(options.os ? { os: options.os } : {}),
    };
  }

  return mapped;
}
