/**
 * Resolve manual/catalog case IDs linked to affected quality-graph intents.
 * Prefers cases.intentId, then implementation.caseId for the same intents.
 */

export type IntentCaseLink = {
  id: string;
  intentId: string | null;
};

export type IntentImplementationLink = {
  intentId: string;
  caseId: string | null;
};

/** Pure collector — unit-tested without a database. */
export function collectCaseIdsForIntents(input: {
  intentIds: readonly string[];
  cases: readonly IntentCaseLink[];
  implementations: readonly IntentImplementationLink[];
}): string[] {
  const intentSet = new Set(input.intentIds.filter(Boolean));
  if (intentSet.size === 0) return [];

  const ids = new Set<string>();
  for (const row of input.cases) {
    if (row.intentId && intentSet.has(row.intentId)) ids.add(row.id);
  }
  for (const impl of input.implementations) {
    if (impl.caseId && intentSet.has(impl.intentId)) ids.add(impl.caseId);
  }
  return [...ids];
}
