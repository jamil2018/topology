import type {
  ExecutionArtifact,
  ExecutionResult,
  ExecutionStatus,
} from "@topology/domain";

const INTENT_KEY_RE = /^\[?([A-Z][A-Z0-9]*-\d+)\]?(?:[:\s]|$)/;

export type CypressTestRef = {
  title?: string | string[];
  state?: string;
  duration?: number;
  displayError?: string | null;
};

export type CypressSpecRef = {
  relative?: string;
  name?: string;
};

export type CypressScreenshotRef = {
  path?: string;
  name?: string;
};

export function intentKeyFromTitle(title: string): string | undefined {
  const match = title.trim().match(INTENT_KEY_RE);
  return match?.[1];
}

export function mapCypressStatus(state: string | undefined): ExecutionStatus {
  switch (state) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "pending":
    case "skipped":
      return "skipped";
    default:
      return "error";
  }
}

export function titlePath(title: string | string[] | undefined): string {
  if (Array.isArray(title)) return title.filter(Boolean).join(" › ");
  return title?.trim() || "untitled";
}

export function mapCypressTest(
  test: CypressTestRef,
  spec: CypressSpecRef,
  options: {
    intentFromTitle?: boolean;
    screenshots?: CypressScreenshotRef[];
  } = {},
): ExecutionResult {
  const fullTitle = titlePath(test.title);
  const leaf = Array.isArray(test.title)
    ? (test.title[test.title.length - 1] ?? fullTitle)
    : fullTitle;
  const file = spec.relative || spec.name || "unknown";
  const intentKey =
    options.intentFromTitle !== false ? intentKeyFromTitle(leaf) : undefined;
  const artifacts: ExecutionArtifact[] = (options.screenshots ?? [])
    .filter((s) => s.path || s.name)
    .map((s) => ({
      kind: "screenshot" as const,
      name: s.name || undefined,
      path: s.path || undefined,
    }));
  const mapped: ExecutionResult = {
    status: mapCypressStatus(test.state),
    durationMs: Math.max(0, test.duration ?? 0),
    title: leaf,
    externalKey: `${file}::${fullTitle}`,
    artifacts,
  };
  if (intentKey) mapped.intentKey = intentKey;
  if (test.displayError) mapped.errorMessage = test.displayError;
  return mapped;
}
