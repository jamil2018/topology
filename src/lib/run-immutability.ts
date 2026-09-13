/** Run statuses that freeze results and structure. */
export const FROZEN_RUN_STATUSES = ["completed"] as const;

export type FrozenRunStatus = (typeof FROZEN_RUN_STATUSES)[number];

export function isRunFrozen(
  status: string | null | undefined,
): status is FrozenRunStatus {
  return status === "completed";
}

export const RUN_IMMUTABLE_MESSAGE =
  "This run is completed and immutable. Results and structure can no longer be changed.";
