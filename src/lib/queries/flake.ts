import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { detectFlakeSignal } from "@topology/domain";
import { db } from "@/db";
import { cases, runResults } from "@/db/schema";

export const FLAKE_HISTORY_LIMIT = 12;

export type FlakeHistoryRow = {
  caseId: string;
  status: string;
  at: Date;
};

export type FlakeHintMap = Map<string, ReturnType<typeof detectFlakeSignal>>;

/**
 * Group already-fetched (case_id, status, at) rows and run detectFlakeSignal.
 * Rows should be the most recent `FLAKE_HISTORY_LIMIT` decisive results per case.
 */
export function flakeHintsFromHistoryRows(rows: FlakeHistoryRow[]): FlakeHintMap {
  const byCase = new Map<
    string,
    Array<{ status: "passed" | "failed"; at: Date }>
  >();
  for (const row of rows) {
    if (!row.caseId) continue;
    if (row.status !== "passed" && row.status !== "failed") continue;
    const list = byCase.get(row.caseId) ?? [];
    list.push({ status: row.status, at: row.at });
    byCase.set(row.caseId, list);
  }
  const map: FlakeHintMap = new Map();
  for (const [caseId, history] of byCase) {
    map.set(caseId, detectFlakeSignal(history));
  }
  return map;
}

async function loadRecentDecisiveResults(opts: {
  caseIds?: string[];
  workspaceId?: string;
}): Promise<FlakeHistoryRow[]> {
  const ranked = db
    .select({
      caseId: runResults.caseId,
      status: runResults.status,
      at: sql<Date>`coalesce(${runResults.executedAt}, ${runResults.createdAt})`.as(
        "at",
      ),
      rn: sql<number>`row_number() over (
        partition by ${runResults.caseId}
        order by coalesce(${runResults.executedAt}, ${runResults.createdAt}) desc nulls last
      )`.as("rn"),
    })
    .from(runResults)
    .innerJoin(cases, eq(runResults.caseId, cases.id))
    .where(
      and(
        sql`${runResults.status} in ('passed', 'failed')`,
        opts.caseIds && opts.caseIds.length > 0
          ? inArray(runResults.caseId, opts.caseIds)
          : undefined,
        opts.workspaceId ? eq(cases.workspaceId, opts.workspaceId) : undefined,
      ),
    )
    .as("flake_ranked");

  const rows = await db
    .select({
      caseId: ranked.caseId,
      status: ranked.status,
      at: ranked.at,
    })
    .from(ranked)
    .where(
      and(
        sql`${ranked.rn} <= ${FLAKE_HISTORY_LIMIT}`,
        sql`${ranked.caseId} is not null`,
      ),
    );

  const history: FlakeHistoryRow[] = [];
  for (const row of rows) {
    if (!row.caseId) continue;
    history.push({
      caseId: row.caseId,
      status: row.status,
      at: row.at,
    });
  }
  return history;
}

export async function getFlakeHintsForCaseIds(caseIds: string[]) {
  if (caseIds.length === 0) {
    return new Map() as FlakeHintMap;
  }
  const rows = await loadRecentDecisiveResults({ caseIds });
  return flakeHintsFromHistoryRows(rows);
}

export async function getFlakeHints(workspaceId: string, limit = 20) {
  const rows = await loadRecentDecisiveResults({ workspaceId });
  const hintsByCase = flakeHintsFromHistoryRows(rows);
  const flakyIds = [...hintsByCase.entries()]
    .filter(([, signal]) => signal.isFlaky && signal.hint)
    .sort((a, b) => b[1].score - a[1].score)
    .slice(0, limit)
    .map(([caseId]) => caseId);
  if (flakyIds.length === 0) return [];

  const caseRows = await db.query.cases.findMany({
    where: and(eq(cases.workspaceId, workspaceId), inArray(cases.id, flakyIds)),
    columns: { id: true, key: true, title: true },
  });
  const byId = new Map(caseRows.map((c) => [c.id, c]));

  return flakyIds
    .map((caseId) => {
      const c = byId.get(caseId);
      const signal = hintsByCase.get(caseId);
      if (!c || !signal?.hint) return null;
      return {
        caseId: c.id,
        caseKey: c.key,
        title: c.title,
        score: signal.score,
        hint: signal.hint,
      };
    })
    .filter((row) => row !== null);
}
