import { z } from "zod";

/**
 * Open JSON execution protocol (Phase 2).
 * Framework adapters / CLI upload post this shape; Topology maps it to runs + results.
 */

export const EXECUTION_PROTOCOL_VERSION = 1 as const;

export const executionStatuses = [
  "passed",
  "failed",
  "error",
  "skipped",
  "blocked",
  "untested",
] as const;

export type ExecutionStatus = (typeof executionStatuses)[number];

export const artifactKinds = [
  "screenshot",
  "log",
  "video",
  "trace",
  "other",
] as const;

export type ArtifactKind = (typeof artifactKinds)[number];

export const executionEnvironmentSchema = z
  .object({
    browser: z.string().min(1).optional(),
    os: z.string().min(1).optional(),
  })
  .strict();

export type ExecutionEnvironment = z.infer<typeof executionEnvironmentSchema>;

export const executionArtifactSchema = z
  .object({
    kind: z.enum(artifactKinds),
    /** Display name or basename. */
    name: z.string().min(1).optional(),
    /** Local or CI workspace path. */
    path: z.string().min(1).optional(),
    /** Remote URL when already uploaded. */
    url: z.string().min(1).optional(),
    contentType: z.string().min(1).optional(),
  })
  .strict()
  .refine((a) => Boolean(a.path || a.url || a.name), {
    message: "artifact requires at least one of name, path, or url",
  });

export type ExecutionArtifact = z.infer<typeof executionArtifactSchema>;

export const executionResultSchema = z
  .object({
    status: z.enum(executionStatuses),
    /** Wall duration in milliseconds. */
    durationMs: z.number().nonnegative().finite().optional(),
    environment: executionEnvironmentSchema.optional(),
    artifacts: z.array(executionArtifactSchema).default([]),
    /** Linked implementation UUID when known. */
    implementationId: z.string().min(1).optional(),
    /** Human intent key (e.g. AUTH-021) when implementation id is unknown. */
    intentKey: z.string().min(1).optional(),
    /** Optional title / external identity for matching. */
    title: z.string().min(1).optional(),
    externalKey: z.string().min(1).optional(),
    errorMessage: z.string().optional(),
    stack: z.string().optional(),
  })
  .strict()
  .refine((r) => Boolean(r.implementationId || r.intentKey || r.externalKey), {
    message:
      "result requires at least one of implementationId, intentKey, or externalKey",
  });

export type ExecutionResult = z.infer<typeof executionResultSchema>;

export const executionReportSchema = z
  .object({
    version: z.literal(EXECUTION_PROTOCOL_VERSION).default(EXECUTION_PROTOCOL_VERSION),
    /** Optional run-level metadata (CI adapters may omit). */
    run: z
      .object({
        externalId: z.string().min(1).optional(),
        commitSha: z.string().min(1).optional(),
        branch: z.string().min(1).optional(),
        environment: executionEnvironmentSchema.optional(),
      })
      .strict()
      .optional(),
    results: z.array(executionResultSchema).min(1),
  })
  .strict();

export type ExecutionReport = z.infer<typeof executionReportSchema>;

export type ExecutionProtocolParseError = {
  path: string;
  message: string;
};

export type ParseExecutionReportResult =
  | { ok: true; report: ExecutionReport }
  | { ok: false; errors: ExecutionProtocolParseError[] };

function formatZodIssues(
  issues: z.ZodIssue[],
): ExecutionProtocolParseError[] {
  return issues.map((issue) => ({
    path: issue.path.length ? issue.path.join(".") : "(root)",
    message: issue.message,
  }));
}

/** Validate unknown JSON into an execution report. */
export function parseExecutionReport(
  input: unknown,
): ParseExecutionReportResult {
  const parsed = executionReportSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, report: parsed.data };
  }
  return { ok: false, errors: formatZodIssues(parsed.error.issues) };
}

/** Throw on invalid input; returns the typed report. */
export function parseExecutionReportOrThrow(input: unknown): ExecutionReport {
  const result = parseExecutionReport(input);
  if (!result.ok) {
    const detail = result.errors
      .map((e) => `${e.path}: ${e.message}`)
      .join("; ");
    throw new Error(`Invalid execution report: ${detail}`);
  }
  return result.report;
}
