# Reports math and error-leak fixes

Date: 2026-09-17. Not committed. Dev server on port 4317 left running (not killed, not reseeded).

## Fixed

### Milestone latest result (BH-RPT-001 / BUGHUNT-MS-001)

`computeReadinessForMilestone` no longer takes the first row of `ORDER BY executed_at DESC` (Postgres `NULLS FIRST`). It selects distinct latest row per suite case with `executed_at DESC NULLS LAST`, then `latestOutcomeByCase` drops null timestamps. An untested placeholder cannot outrank a real pass.

Live `GET /api/milestones` on Topology: `v1 launch gate` is No-Go, score 85, pass 100%, executed 50% (expected from TOP-1 passed / TOP-2 untested). Project-wide gates (mass-probe, BUGHUNT-MS-dup) are pass 61% / executed 65%, not the old NULLS FIRST 43% / 8%.

A null pass rate is no longer scored as 100 (`passComponent = passRate ?? 0`).

### Empty suite (BUGHUNT-MS-002)

`computeMilestoneReadiness` returns `status: "unknown"`, badge `No data`, score 0, reason `No cases in scope` when every in-scope case is missing or deprecated. It does not return Go at 100.

`getActiveMilestoneReadiness` walks active milestones newest-first and skips `unknown`. An empty suite cannot become `?active=1` just because it was created last. Live: `BUGHUNT-MS-vacuous` and `BUGHUNT-MS-empty` are `unknown` / `No data`. Active gate is `mass-probe` (has cases), not the empty Auth-folder milestone.

The milestones page prints `executed n/a` for `unknown` so it does not look like a measured 0%.

### Bad run / report ids (BH-RPT-002, UI-1, runs-page-sql-and-password-hash)

`/runs/[id]` and `/reports/[id]` call `notFound()` unless the id is a UUID, before the query. `getRunWithResults` / `getRunReport` also return null for a non-UUID so the driver never sees `not-a-uuid`. Reports `error.tsx` and a new runs `[id]/error.tsx` do not render `error.message`. The reports list catch no longer forwards `err.message` into the page.

Live signed-in `GET /reports/not-a-uuid` and `/runs/not-a-uuid`: in-shell “This page could not be found.” Body does not contain `Failed query`, `password_hash`, `PostgresError`, or `invalid input syntax`.

HTTP status is still 200. Next.js 16 streams a `loading.tsx` fallback before `notFound()`, and the status cannot change after streaming starts (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/loading.md`). Removing those loading files would regress skeletons; left in place. Dev flight data still includes the `notFound()` throw stack (`NEXT_HTTP_ERROR_FALLBACK`, `node:internal`). That is the framework interrupt, not the driver query.

### Search NUL (BH-RPT-004)

`GET /api/search` rejects NUL and queries longer than 200 with 400 `{ error: "Invalid search query" }`. Driver failures on that route are the same 400 and do not echo SQL. `\` `%` `_` are escaped before `ilike` (BH-RPT-005). Live: `q=a\0b` is 400 JSON; `q=%` is 200 with zero hits, not the capped lists.

### Stored JSON.parse

`listSavedViews` and `GET /api/views` use `parseCaseViewConfig` / `parseRunViewConfig`, which already catch bad JSON and fall back to empty defaults. A corrupt `config_json` no longer 500s `/cases`, `/runs`, or the views list.

### Malformed JSON on owned routes (BUGHUNT-ISSUE-005)

`request.json()` is caught and returned as 400 `{ error: "Invalid JSON body" }` on `POST`/`PATCH /api/milestones`, `PATCH /api/triage`, and `PATCH /api/settings`. Live probes of `{` and `not-json` were 400 with no SQL. Triage body id `not-a-uuid` was already 400 via zod (confirmed). `DELETE /api/views/:id` already 400s a bad UUID. Flake has no JSON body and no UUID path param, so nothing to change there.

## Skipped (not in owned files)

- **BH-RPT-003** pending untested list capped at 50: `src/lib/issues.ts` `whatsPending`. Not owned (issues helpers / agent resource). Still silently `limit: 50`.
- **Unsafe `JSON.parse`**: `src/lib/ci-ingest.ts` `loadShardResults` (do not edit ci-ingest). Also `packages/mcp/src/client.ts` and `packages/issue-providers/src/http.ts` (not owned).
- **Triage misses** for blocked results and agent `record_result`: fixes live in `ci-ingest.ts`, `src/app/api/agent/route.ts`, and `src/app/api/runs/[id]/route.ts`. Not owned.
- Issues-route malformed JSON: another agent owns that route.
- Flake `limit=0` ignored: not a 400. Left as specified (“only bad-UUID / malformed-JSON”).
- Saved-view size cap and duplicate names: not the 400 scope; unique index would touch `schema.ts` (forbidden).
- BH-RPT-008 unauthenticated 307: `auth.config.ts` / middleware, not owned.

## Tests

`npx vitest run --config vitest.packages.config.ts packages/domain/src/domain.test.ts` — 23 passed. Covers null-`executedAt` vs timestamped pass, placeholder-only cases, empty suite not Go, and a missing pass rate not scoring as 100. Did not run `test:e2e`.
