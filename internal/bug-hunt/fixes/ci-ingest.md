# CI ingest fixes

Date: 2026-09-17. Not committed. No db:seed. Schema left unchanged (`schema.ts` is out of scope), so shard uniqueness is a run-row lock plus delete-and-replace inside one transaction, not a new unique index.

## Files changed

- `packages/domain/src/junit.ts` — nesting XML walker (no XML library is a direct dependency; `saxes` is only a jsdom devDependency)
- `packages/domain/src/junit.test.ts`
- `packages/domain/src/index.ts` — export `dedupeNormalizedResults`
- `fixtures/junit/false-green.xml`
- `packages/cli/src/index.ts` — `loadJUnit` uses the same dedupe as ingest
- `src/lib/ci-ingest.ts`
- `src/lib/ci-ingest.test.ts`
- `src/app/api/ci/junit/route.ts`
- `src/app/api/ci/runs/route.ts`
- `src/app/api/ci/runs/[id]/shards/route.ts`
- `src/app/api/ci/runs/[id]/complete/route.ts`

## Bugs fixed

| Id | What changed |
| --- | --- |
| BUGHUNT-CI-false-green-testcase-close | A close tag only ends the element it names. `</testcase>` inside `<system-out>` stays text, so the later `<failure>` is still a child and the case is stored failed. Fixture: `fixtures/junit/false-green.xml`. |
| BUGHUNT-CI-nested-suite-drops-failure | Suites are walked by nesting. A sibling after an inner suite is kept. Same fixture. |
| BUGHUNT-CI-comment-and-cdata-ingested | Comments are skipped. CDATA is text, not markup. |
| BUGHUNT-CI-skipped-hides-failure | Status comes from direct child elements. Failure/error beats skipped. A `<failure>` inside `system-out` does not fail the case. |
| BUGHUNT-CI-single-quote-unknown | Attribute reader accepts `'` and `"`. |
| BUGHUNT-CI-regex-redos | Walker is linear. Unclosed `<testsuite ` no longer backtracks. |
| BUGHUNT-CI-complete-partial-or-empty | Complete returns **409** `{ error: "incomplete", missing }` unless distinct shard indexes cover `1..shardTotal`. It does not mark the run completed. |
| BUGHUNT-CI-stale-result-false-summary | Shard store, result replace, and `shardsReceived` run in one transaction under `SELECT … FOR UPDATE` on the run. External-key `run_results` for that run are deleted and rewritten from the merged shard payloads. HTTP summary is those stored rows, so a resubmit that drops a failure cannot report pass while the row remains. |
| BUGHUNT-CI-junit-bypasses-shards | `/api/ci/junit` rejects an in-progress run with `shardTotal > 1` or any shard rows (**409**). It does not force `shardsReceived: 1` or complete over a shard failure. New single-shard submits create the run and results in one transaction. |
| BUGHUNT-CI-case-key-silent-overwrite / ci-case-key-truncation-500 | Keys that share only the first 80 sanitized characters get a hash suffix, so they are not the same case. `findOrCreateCaseForExternal` catches `err.cause.code === "23505"`, reuses the visible row, or inserts a disambiguated key. Result upsert no longer matches a different external key via case id. |
| BUGHUNT-CI-concurrent-shard-500 / B7 | Same-index posts serialize on the run lock, update the existing shard row, and delete leftover duplicate shard rows. `shardsReceived` is the count of distinct in-range indexes, not row count. |
| B1 (CI paths) | Unique violations on these routes are **409** `{ error: "Conflict" }`. Other ingest failures are **500** `{ error: "Ingest failed" }`. Neither body includes SQL. |
| B2 | JUnit create + results + complete are one transaction. A case-key failure rolls the run back instead of leaving `in_progress`. |
| BUGHUNT-CI-duplicate-keys-triple-insert | Duplicate `externalKey`s in one payload collapse (a later pass cannot hide a failure). CLI `loadJUnit` uses the same helper, so submit and merge-local agree on a single file. |
| BUGHUNT-CI-shard-index-unbounded | `shardIndex` is `1..256` and must be `<= shardTotal`. `2147483648` and `999999` are **400**, not a Postgres overflow 500. |
| BUGHUNT-CI-partial-write-500 / uncaught JSON / duration overflow | Malformed JSON is **400** `{ error: "Invalid JSON body" }` on runs, junit, shards, and complete. Non-UUID path ids are **400** `{ error: "Invalid run id" }` before SQL. `durationMs` must be an int4 integer or the body is **400**, so overflow cannot insert a partial run. Corrupt shard JSON is ignored and does not count as coverage. |

Tests: `npm run test:unit -- packages/domain/src/junit.test.ts src/lib/ci-ingest.test.ts packages/cli/src/merge-local.test.ts` — 18 passed.

## Skipped

- No unique `(run_id, shard_index)` or `(run_id, external_key)` — `schema.ts` was not edited. The lock and replace cover the race; a constraint would still be the durable fix.
- Cross-shard overlap still last-index-wins (`mergeShardResults`). A higher shard can replace a lower shard's failure. Existing merge tests and the integration shard test depend on that. Medium.
- CLI `--shards abc` still falls back to `1`. `--shard 0` is still rejected by the API. Empty `merge-local` still exits 0. Medium, not the XML parser.
- Notes length is uncapped. Negative `durationMs` is still accepted (it fits int4).
- Custom entities are still not expanded. XXE / billion-laughs stay unresolved on purpose.
- Triage still ignores blocked results and agent `record_result`. Out of these files.
- Folder cycles, role/project unique 500s, and other non-CI races were not touched.
