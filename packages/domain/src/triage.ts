export type TriageFailure = {
  id: string;
  caseKey: string;
  caseTitle: string;
  priority: "P0" | "P1" | "P2" | "P3";
  runId: string;
  runName: string;
  notes: string;
  failedAt: Date | string | null;
  occurrenceCount?: number;
  isFlaky?: boolean;
};

export type TriageQueueItem = TriageFailure & {
  fingerprint: string;
  rank: number;
  urgency: "immediate" | "soon" | "later";
  reason: string;
};

const priorityWeight: Record<TriageFailure["priority"], number> = {
  P0: 100,
  P1: 70,
  P2: 40,
  P3: 20,
};

export function failureFingerprint(input: {
  caseKey: string;
  notes: string;
}): string {
  const note = input.notes.trim().split("\n")[0]?.slice(0, 120) ?? "";
  return `${input.caseKey}::${note}`.toLowerCase();
}

export function buildTriageQueue(
  failures: TriageFailure[],
): TriageQueueItem[] {
  const items = failures.map((failure) => {
    const fingerprint = failureFingerprint(failure);
    const occurrences = failure.occurrenceCount ?? 1;
    const ageHours = failure.failedAt
      ? Math.max(
          0,
          (Date.now() - new Date(failure.failedAt).getTime()) / 3_600_000,
        )
      : 0;

    let rank =
      priorityWeight[failure.priority] +
      Math.min(occurrences, 10) * 4 -
      Math.min(ageHours, 72) * 0.2;

    if (failure.isFlaky) {
      rank -= 15;
    }

    let urgency: TriageQueueItem["urgency"] = "later";
    if (failure.priority === "P0" || occurrences >= 3) urgency = "immediate";
    else if (failure.priority === "P1" || occurrences >= 2) urgency = "soon";

    const reasonParts = [
      `${failure.priority} failure`,
      occurrences > 1 ? `${occurrences}× seen` : null,
      failure.isFlaky ? "flake suspect" : null,
    ].filter(Boolean);

    return {
      ...failure,
      fingerprint,
      rank,
      urgency,
      reason: reasonParts.join(" · "),
    };
  });

  return items.sort((a, b) => b.rank - a.rank);
}
