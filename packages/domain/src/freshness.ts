/**
 * Freshness from last relevant execution vs entity / related change times.
 *
 * Phase 1 callers may pass only `lastExecutedAt` (string/Date/null) — that
 * still returns `fresh` | `unverified`. Phase 3 input adds mtimes for
 * `potentially_stale` | `stale`.
 */

export type FreshnessState =
  | "fresh"
  | "potentially_stale"
  | "stale"
  | "unverified";

export type FreshnessInput = {
  lastExecutedAt: Date | string | null | undefined;
  /**
   * Latest updatedAt of the entity itself (intent, requirement, or
   * implementation). A change after execution → `stale`.
   */
  entityUpdatedAt?: Date | string | null;
  /**
   * Latest updatedAt of related graph nodes (components, requirements linked
   * to an intent, etc.). A change after execution → `potentially_stale`
   * when the entity itself is not newer than the execution.
   */
  relatedUpdatedAt?: Date | string | null;
};

export type FreshnessResult = {
  state: FreshnessState;
  /** Short human-readable reason; null when fresh. */
  reason: string | null;
};

function toTime(value: Date | string | null | undefined): number | null {
  if (value == null || value === "") return null;
  const t = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(t) ? t : null;
}

function isAfter(candidate: number | null, baseline: number): boolean {
  return candidate != null && candidate > baseline;
}

function detailFromInput(input: FreshnessInput): FreshnessResult {
  const executedAt = toTime(input.lastExecutedAt);
  if (executedAt == null) {
    return { state: "unverified", reason: "Never executed" };
  }

  const entityAt = toTime(input.entityUpdatedAt);
  if (isAfter(entityAt, executedAt)) {
    return {
      state: "stale",
      reason: "Entity changed after last execution",
    };
  }

  const relatedAt = toTime(input.relatedUpdatedAt);
  if (isAfter(relatedAt, executedAt)) {
    return {
      state: "potentially_stale",
      reason: "Related component or requirement changed after last execution",
    };
  }

  return { state: "fresh", reason: null };
}

function isFreshnessInput(value: unknown): value is FreshnessInput {
  return (
    typeof value === "object" &&
    value !== null &&
    !(value instanceof Date) &&
    "lastExecutedAt" in value
  );
}

/**
 * Compute freshness state.
 *
 * - `computeFreshness(lastExecutedAt)` — Phase 1 compatible
 * - `computeFreshness({ lastExecutedAt, entityUpdatedAt?, relatedUpdatedAt? })`
 */
export function computeFreshness(
  lastExecutedAtOrInput: Date | string | null | undefined | FreshnessInput,
): FreshnessState {
  if (isFreshnessInput(lastExecutedAtOrInput)) {
    return detailFromInput(lastExecutedAtOrInput).state;
  }
  return detailFromInput({ lastExecutedAt: lastExecutedAtOrInput }).state;
}

/** Full state + reason for badges and Hub copy. */
export function computeFreshnessDetail(input: FreshnessInput): FreshnessResult {
  return detailFromInput(input);
}

export function freshnessLabel(state: FreshnessState): string {
  switch (state) {
    case "fresh":
      return "Fresh";
    case "potentially_stale":
      return "Potentially stale";
    case "stale":
      return "Stale";
    case "unverified":
      return "Unverified";
  }
}
