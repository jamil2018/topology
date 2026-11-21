/** Run statuses that freeze results and structure. */
export const FROZEN_RUN_STATUSES = ["completed", "aborted"] as const;

export type FrozenRunStatus = (typeof FROZEN_RUN_STATUSES)[number];

export function isRunFrozen(
  status: string | null | undefined,
): status is FrozenRunStatus {
  return status === "completed" || status === "aborted";
}

/** Frozen runs that may be reopened with runs.complete (or admin). */
export function isReopenableRunStatus(
  status: string | null | undefined,
): status is FrozenRunStatus {
  return isRunFrozen(status);
}

export const RUN_IMMUTABLE_MESSAGE =
  "This run is completed and immutable. Results and structure can no longer be changed.";

export const ABORTED_RUN_MESSAGE =
  "This run is aborted and immutable. Results and structure can no longer be changed.";

export const RUN_REOPEN_MESSAGE =
  "Reopening clears the completed timestamp and returns this run to in progress so results can be edited again.";

const TERMINAL_RESULT_STATUSES = new Set([
  "passed",
  "failed",
  "blocked",
  "skipped",
]);

/** Count results that are still untested or otherwise not terminal. */
export function pendingResultCount(statuses: readonly string[]): number {
  return statuses.filter((status) => !TERMINAL_RESULT_STATUSES.has(status))
    .length;
}

export function immutableMessageFor(
  status: string | null | undefined,
): string {
  if (status === "aborted") return ABORTED_RUN_MESSAGE;
  return RUN_IMMUTABLE_MESSAGE;
}
