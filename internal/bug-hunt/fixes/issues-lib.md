# Issues helper fixes

Date: 2026-09-17. Not committed. Dev server on port 4317 left running (not killed, not reseeded). `.env.local` was not sourced.

## Fixed

### Pending untested work (BH-RPT-003)

`whatsPending` no longer returns a silent `limit: 50` page as if it were the full untested set. It counts untested results, orders the page by `createdAt` descending, and returns at most `PENDING_PAGE_LIMIT` (200) rows plus `untestedTotal`, `untestedLimit`, and `untestedTruncated`. The agent route already JSON-encodes this object, so the payload discloses the cap without a second product screen.

The recorded snapshot (131 untested) fits in the raised page. Anything past 200 stays truncated in the list and is visible in the total.

### Failures without a linked issue

The old list queried failed and blocked separately at 50, concatenated failed-first, then `slice(0, 30)`. A full failed page dropped every blocked row. Each status now has its own page and count. Linked result ids are excluded in the query. `failuresWithoutIssueTotal` / `failuresWithoutIssueTruncated` are separate from the page length.

`selectFailuresWithoutIssue` keeps `failed` and `blocked` and ignores who recorded the row. An agent-recorded result with either status is included here if it exists as a result and has no linked issue. This file does not enqueue `triage_items`.

## Not in this file

Blocked results and agent `record_result` still never enter the triage table. That write is `openTriageForFailures` / `openTriageForResult` in `src/lib/ci-ingest.ts` (failed only) and `src/app/api/agent/route.ts` (no triage call). `getTriageQueue` is in `src/lib/queries.ts`. Those files were not edited.

Hub open-triage (`queries.ts` / `hub-pulse.tsx`) still counts triage rows, not `failuresWithoutIssue`. BH-RPT-009 is that product split, not a silent cap in this helper.

## Tests

`npx vitest run --config vitest.packages.config.ts src/lib/issues.pending.test.ts` — 4 passed. The page total is not the row count, the limit is above 50, and a full failed page does not drop a blocked row.
