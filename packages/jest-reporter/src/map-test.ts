import type { ExecutionResult, ExecutionStatus } from "@topology/domain";

const INTENT_KEY_RE = /^\[?([A-Z][A-Z0-9]*-\d+)\]?(?:[:\s]|$)/;

export type JestAssertionRef = {
  title: string;
  ancestorTitles?: string[];
  status: string;
  duration?: number | null;
  failureMessages?: string[];
};

export function intentKeyFromTitle(title: string): string | undefined {
  const match = title.trim().match(INTENT_KEY_RE);
  return match?.[1];
}

export function mapJestStatus(status: string): ExecutionStatus {
  switch (status) {
    case "passed":
      return "passed";
    case "failed":
      return "failed";
    case "pending":
    case "skipped":
    case "disabled":
    case "todo":
      return "skipped";
    default:
      return "error";
  }
}

export function mapJestAssertion(
  assertion: JestAssertionRef,
  testFilePath: string,
  options: { intentFromTitle?: boolean } = {},
): ExecutionResult {
  const titlePath = [...(assertion.ancestorTitles ?? []), assertion.title]
    .filter(Boolean)
    .join(" › ");
  const intentKey =
    options.intentFromTitle !== false
      ? intentKeyFromTitle(assertion.title)
      : undefined;
  const failure = assertion.failureMessages?.filter(Boolean).join("\n") || undefined;
  const mapped: ExecutionResult = {
    status: mapJestStatus(assertion.status),
    durationMs: Math.max(0, assertion.duration ?? 0),
    title: assertion.title,
    externalKey: `${testFilePath}::${titlePath || assertion.title}`,
    artifacts: [],
  };
  if (intentKey) mapped.intentKey = intentKey;
  if (failure) mapped.errorMessage = failure;
  return mapped;
}
