# CI ingest bug hunt

Date: 2026-09-17. Live `http://127.0.0.1:4317`. Prefix `BUGHUNT-CI-`. No code changes, no server restart, no db:seed/push/migrate, no integration/e2e.

Routes: `src/app/api/ci/runs`, `src/app/api/ci/runs/[id]/shards`, `src/app/api/ci/runs/[id]/complete`, `src/app/api/ci/junit`. CLI: `npm run topology -- …` (`packages/cli/src/index.ts`). Parser: `packages/domain/src/junit.ts`. Fixture: `fixtures/junit/smoke.xml` plus local `/tmp/bughunt-ci/*.xml` (not committed). Stored rows read back via `GET /api/agent?resource=results&runId=`.

JUnit XML is parsed only in the CLI (`loadJUnit` → `parseJUnitXml`). The API accepts normalized JSON, so parser bugs become persisted CI results as soon as `junit submit` or `runs submit-thread` runs.

---

## Coverage

| Attempt | Result |
| --- | --- |
| No auth, wrong token, empty `Bearer`, `Bearer` without space, lowercase `bearer`, Basic, raw token, token only in query, query token + wrong header | **401**. Query token not accepted and not reflected. |
| Missing token on CLI | Exits `TOPOLOGY_API_TOKEN is required` before HTTP. |
| Invalid JSON, empty body, raw XML posted to `/api/ci/junit` | **500**, empty body (not 400). |
| Non-UUID run id on shards/complete | **500**, empty body. Nil UUID → 404. |
| Negative / 0 / float `shardIndex` | **400**. |
| `shardIndex` 999999 vs `shardTotal` 2 | **200**. Index not bounded. |
| `shardIndex` 2147483648 | **500** (Zod allows it; Postgres `integer` does not). |
| Empty results, missing `externalKey` / `status`, `status: "error"` / `"Passed"`, empty name, `shardTotal` 0 / -1 / 1.5 / 257 | **400**. |
| XXE `SYSTEM file:///etc/hostname` and `file:///tmp/bughunt-ci/marker.txt`; billion-laughs `&lol3;` | **Not resolved.** Notes stayed `&xxe;\|&local;` and `&lol3;`. Regex decoder only handles `&lt; &gt; &quot; &apos; &amp;`. |
| Complete twice; shard after complete | **409** immutable. Holds. |
| Complete with 0 of 3 shards; complete with 1 of 4 shards | **200 completed**. False done. |
| Overlapping keys, higher index wins even if it arrived first | Pass on index 2 erased a later-arriving fail on index 1. |
| Same shard index ×12 concurrent; distinct indices ×8 concurrent | Duplicate shard rows, duplicate results, **500**s that still commit. |
| CLI `--shards abc` | Silently creates `shardTotal: 1`. `--shards 0` / `--shard 0` fail at the API (400). |
| Huge notes (50_000 chars), `durationMs: -5` | **200**. No cap. `durationMs: 9999999999999` → 500 after a partial insert. |
| Parser ReDoS: 80_000 unclosed `<testsuite ` (~880KB) | CLI `merge-local` burned **48.23s** CPU, then empty results. |

---

## Bugs

### 1. Critical — `</testcase>` inside output drops the failure (false green)

`packages/domain/src/junit.ts:100-101` matches each case with a non-greedy `</testcase>`. Anything that prints that string (XML/HTML snapshots, the case’s own log) ends the case before a later `<failure>`. Default status is passed (`junit.ts:70`). `loadJUnit` (`packages/cli/src/index.ts:90-94`) posts that lie.

Live CLI submit of a suite whose `tests="1" failures="1"` case had `<system-out>… </testcase> …` and then `<failure message="assertion failed">`:

- Run `dace1d6b-9533-464c-91c1-21a5884e033c` (`BUGHUNT-CI-cli-false-green`)
- HTTP/CLI summary: `total: 1, passed: 1, failed: 0, passRate: 100`, `ok: true`
- Stored result: `auth::should-fail` **passed**, notes empty
- Run status **completed**

**Fix:** Stop regex-parsing JUnit. Use an XML parser with DTD/external entities disabled, and only read `testcase` elements as elements. Do not treat text or CDATA as markup.

### 2. Critical — nested `<testsuite>` drops later cases, including failures

`junit.ts:134-135` matches from the first `<testsuite` to the first `</testsuite>`. An inner suite closes that match, so siblings after the inner suite are never parsed.

`merge-local` on an outer suite (`tests="2"`) containing an inner passing case plus a sibling `<failure message="must-not-drop">` returned only `inner::kept` **passed**, `passRate: 100`. The failure was gone.

**Fix:** Same as 1. If keeping a walker, scan sibling suites, not a single non-greedy close.

### 3. High — comments and CDATA are ingested as real tests

The parser never strips comments or CDATA (`junit.ts:128-161`, case regex at `100-101`).

- Comment-only failure became a stored failed result. Run `6424a6bd-bc77-4fd3-ba44-317afbf45333`: `ghost::commented` **failed**, notes `should-not-ingest`, plus `real::ok` passed. Summary `failed: 1, passRate: 50`.
- CDATA `</testcase><testcase classname="injected" name="planted"><failure message="planted-failure"/>` parsed as a second case `injected::planted` **failed**.

A test that logs a commented snippet or a CDATA blob can invent failures or hide the real case. Combined with overwrite-by-key, a planted pass can also mask a real failure.

**Fix:** Real XML parser (comments are not nodes; CDATA is text).

### 4. High — `<skipped>` hides a `<failure>`; a raw `<failure>` in logs fails a pass

`junit.ts:73-76` checks skipped before failure/error and never looks at both.

- Case with `<skipped message="flaky"/>` and `<failure message="still failed">` normalized to **skipped**, notes `flaky`. Failure message dropped. `passRate: null` (skipped is not executed), so a gate that only fails on `failed > 0` stays green.
- A passing case whose `<system-out>` contained a literal `<failure message="false-fail">` normalized to **failed**. Escaped `&lt;failure` did not. Unescaped log text is enough.

**Fix:** Status from child elements only, priority failure/error over skipped. Ignore tags that are text.

### 5. High — complete does not require shards, and the HTTP summary is not the stored run

`src/app/api/ci/runs/[id]/complete/route.ts:40-75` loads shard JSON, upserts the merge if any shards exist, then sets `status: "completed"` with no check that distinct `shardIndex` values cover `1..shardTotal`. The response `summary` is `summarizeResults(merged)` from shard payloads. The webhook payload (`src/lib/webhooks.ts:141-159`) counts **DB** `run_results`. Those disagree.

| Run | Request | HTTP result | What is stored |
| --- | --- | --- | --- |
| `342a81f1-7e13-429d-b6bc-c04cd70fdf24` | complete before any shard (`shardTotal: 3`) | **200** `completed`, `shardsReceived: 0`, summary `total: 0, passRate: null` | Same. A `failed === 0` gate is green. Later shard **409**. |
| `ecca9d7f-019c-4129-9759-e712ce80012f` | 1 of 4 shards, all passing, then complete | **200** `completed`, `shardsReceived: 1`, `shardTotal: 4`, `passRate: 100` | Only the one shard. Missing shards are not a failure. |
| `1573a364-e2be-4268-a754-323535d3bc92` | shard 1 had `keep` pass + `stale-fail` fail; resubmit shard 1 with only `keep`; complete | Resubmit and complete summaries `total: 1, passed: 1, failed: 0, passRate: 100` | Agent results still has **both** rows, including `BUGHUNT-CI::stale-fail` **failed**. |

`upsertRunResultsFromNormalized` (`src/lib/ci-ingest.ts:61-98`) never deletes results missing from the new merge. `storeShardPayload` replaces one shard’s JSON, but leftover `run_results` stay. Complete still calls `openTriageForFailures` (`complete/route.ts:61`, `ci-ingest.ts:102-115`) on every DB `failed` row, so the green HTTP summary and the triage/webhook view split.

**Fix:** Reject complete unless `shardTotal` is covered (or return 409 `incomplete` with missing indices). Compute the public summary from the rows you intend to keep. In one transaction, delete `run_results` for that run whose `externalKey` is not in the merged set, then upsert.

### 6. High — `/api/ci/junit` on an in-progress sharded run freezes it and lies about the shard

`src/app/api/ci/junit/route.ts:94-123` upserts only the posted array, then sets `status: "completed"` and `shardsReceived: 1` regardless of `shardTotal` or existing shards. Response summary is the request body, not the DB.

Run `8ebf5d56-f716-4581-b325-a90c9ed3c920` (`BUGHUNT-CI-junit-bypass`, `shardTotal: 3`):

1. Shard 1 stored `BUGHUNT-CI::from-shard` **failed**.
2. `POST /api/ci/junit` with `runId` and one **passed** result.
3. Response summary: `total: 1, passed: 1, failed: 0, passRate: 100`.
4. Stored: that pass **and** the shard failure. Run `completed`, `shardsReceived: 1`, `shardTotal: 3`.

**Fix:** Reject junit writes onto a sharded in-progress run, or merge them as a shard and do not force `shardsReceived: 1`. Return a summary from stored rows.

### 7. High — 80-character case keys silently delete a different test

`src/lib/ci-ingest.ts:14-17` slices the sanitized external key to 80 chars, then prefixes `AUTO-`. There is no uniqueness on `(run_id, external_key)` (`src/db/schema.ts:277-299`). Upsert matches an existing row by truncated case id (`ci-ingest.ts:67-83`) without refreshing the in-memory map.

Run `25d2f9da-3212-4bae-8e13-da4a84cdd681`:

- Shard 1: key `BUGHUNTCI_` + 90 `A`s, status passed. Summary `total: 1`.
- Shard 2: same prefix plus `DIFF`, status failed. Response summary `total: 2, passed: 1, failed: 1`.
- Stored: **1 row**, external key ending in `DIFF`, status **failed**, title `beta`, case key `AUTO-BUGHUNTCI_` + 66 `A`s (80-char slice). The passing test is gone. No 500.

This is not the static hunt’s “second insert 500s” path. Sequential collision finds the case and overwrites the other result. The 500 is the concurrent path (bug 8).

**Fix:** Do not truncate into the unique key. Store the full external key and a hash suffix if a length cap is required. Upsert `run_results` on `(run_id, external_key)`. Do not reuse `byCase` across different external keys.

### 8. High — concurrent shard submits 500, duplicate rows, and do not heal

`run_shards` has no unique `(run_id, shard_index)` (`src/db/schema.ts:331-339`). `storeShardPayload` (`ci-ingest.ts:182-207`) is check-then-insert. Each request then `loadShardResults` and upserts the union (`shards/route.ts:65-84`). `findOrCreateCaseForExternal` is also check-then-insert against `cases_workspace_id_key_unique` (`schema.ts:245`). No transaction.

12 concurrent posts of shard index `1` with distinct keys (`cdb608bf-b578-4495-9006-0f05429314dd`):

- HTTP: **11 × 500**, one 200 with `received: 8`.
- After they settled: `shardsReceived: 8` on a run whose `shardTotal` is 1.
- Stored result keys duplicated (`race-same-0` three times, 13 rows).
- Server log: `duplicate key value violates unique constraint "cases_workspace_id_key_unique"` at `ci-ingest.ts:24`, called from `shards/route.ts:70`. Client body was empty.
- A later sequential resubmit of index 1 returned `received: 8` still, summary `total: 8` (it merged the duplicate shard payloads), and stored **15** rows including `race-final`. Retry does not collapse orphans.

8 concurrent distinct indices (`0d3763e3-0761-42ff-b1db-fdc3ed457425`, `shardTotal: 8`):

- HTTP: **7 × 500**, one 200 with `received: 6`.
- Final `shardsReceived: 6` (undercount) with 16 stored rows and duplicate keys for the same shard. Every logical key was present at least once, so a 500 did not roll back.

**Fix:** Unique `(run_id, shard_index)` and upsert. Unique `(run_id, external_key)`. `INSERT … ON CONFLICT` for cases, with a retry on 23505. Wrap store + upsert + `shardsReceived` update in one transaction. Catch unique violations; do not 500 after a partial commit.

### 9. High — duplicate test names are three results on the API, one on `merge-local`

`mergeShardResults` (`junit.ts:199-206`) keeps the last key. `/api/ci/junit` passes the raw array to upsert (`junit/route.ts:94-98`) and summarizes the raw array (`junit/route.ts:123`). The upsert map is built once before the loop (`ci-ingest.ts:52-59`), so the second and third copies of the same key insert new rows.

`POST /api/ci/junit` with three `BUGHUNT-CI::dupkey` rows (failed, passed, failed):

- Run `8ff821b4-4c63-43b0-9561-da86e6033c5f`
- Summary: `total: 3, passed: 1, failed: 2, passRate: 33`
- Stored: **3** `run_results` with that key (notes `first`, `second-pass-masks?`, `third`)

`junit merge-local` on `dupes.xml` (same classname/name three times) collapsed to **one** failed row with notes `third-error`. `junit submit` does not call `mergeShardResults` (`cli/src/index.ts:100-113`), so the CLI submit path matches the API, not `merge-local`.

**Fix:** Dedupe by `externalKey` before insert (fail wins, or reject duplicates with 400). Unique `(run_id, external_key)`. Make `junit submit` and `merge-local` use the same merge.

### 10. Medium — shard index is not checked against `shardTotal`

`shards/route.ts:20` is `z.number().int().min(1)` with no max and no compare to `run.shardTotal`.

- Index `999999` on a `shardTotal: 2` run: **200**, `shard: { index: 999999, received: 1, total: 2 }`. Result `h::a` stored. Later overlap posts reported `received: 3` against `total: 2`.
- Index `2147483648`: **500**, empty body (int4 overflow on `run_shards.shard_index`).

Overlapping keys are not rejected. Higher `shardIndex` wins even if it arrived first (`junit.ts:198-206`, `loadShardResults` orders by index at `ci-ingest.ts:215`). On run `89d4291e-008c-42e8-9388-d20128bf3dee`, shard 2 pass was stored first, then shard 1 fail for `BUGHUNT-CI::overlap`. Stored status stayed **passed**, notes `shard2-pass`. A failure can be erased by any higher-index shard that repeats the key.

**Fix:** Require `1 <= shardIndex <= shardTotal`. Reject or explicitly allow overlap. If shards are partitions, fail the merge when the same `externalKey` appears in two indices instead of last-index-wins. Cap `shardIndex` at 256 like `shardTotal`.

### 11. Medium — single-quoted attributes collapse into `unknown`

`attr()` only reads double quotes (`junit.ts:43-45`). `name='login_single'` / `classname='AuthSuite'` became `externalKey: "unknown"`, empty classname and name, status passed. A second nameless case also becomes `unknown` (`externalKeyForCase` at `junit.ts:171`). Those tests merge into one row and share case `AUTO-unknown`.

**Fix:** Real XML parser. Until then, reject a document that yields `unknown` rather than ingesting it as a pass.

### 12. Medium — unhandled DB/JSON errors, and a 500 that already wrote a run

`request.json()` is not caught:

- `src/app/api/ci/runs/route.ts:54`
- `src/app/api/ci/junit/route.ts:45`
- `src/app/api/ci/runs/[id]/shards/route.ts:57`

Live: invalid JSON, empty body, and `Content-Type: application/xml` on `/api/ci/junit` all returned **500** with an empty body.

`durationMs` is `z.number()` (`shards/route.ts:29`, `junit/route.ts:24`) written to a Postgres `integer` (`schema.ts:290`). `POST /api/ci/junit` with a passing result (`durationMs: 10`) plus a failing result (`durationMs: 9999999999999`) returned **500**. Run `6574a764-7160-4c10-a8bf-00d693a8cd2d` was left **in_progress**, `shardsReceived: 1`, with only `BUGHUNT-CI::ok-before-overflow` stored. The failure never landed. No transaction around create + upsert + complete (`junit/route.ts:71-110`).

Negative duration (`-5`) and a 50_000-character notes string were accepted (**200**). No body size or notes cap. CLI parsed a 2MB `<system-out>` into `notes` (length 2_000_011) without a limit (`junit.ts:185`).

Non-UUID path ids on shards/complete: **500**, empty body. Server logged `invalid input syntax for type uuid`.

**Fix:** `safeParse` JSON, map `SyntaxError` to 400, invalid UUID to 400. Cap `durationMs` to int4 and notes length. One transaction per ingest so a later failure rolls back the run insert.

### 13. Medium — CLI silently rewrites `--shards`, and 0-based shards fail only after a round trip

`packages/cli/src/index.ts:124-131`: `Number("--shards abc")` is `NaN`, and `Number.isFinite` falls back to **1**. Live run `c289600d-9d09-407a-967b-b762fcc2bbe7` was created as `shardTotal: 1` for `--shards abc`. The API would have rejected a non-integer (`runs/route.ts:15`).

`--shards 0` is sent as 0 and the API returns 400 (CLI exits 1). `--shard 0` is the same. Jest/Playwright shard indices are often 0-based; the API minimum is 1 (`shards/route.ts:20`) and the CLI does not translate. Empty suite XML (`results: []`) makes `junit submit` HTTP 400, while `merge-local` exits 0 with `passRate: null`.

**Fix:** Validate flags locally with the same Zod schema. Do not coerce invalid `--shards` to 1. Document shard indexes as 1-based, or accept 0 and shift. Fail `merge-local` on zero cases if `submit` rejects them.

### 14. Medium — local regex DoS on unclosed `<testsuite>`

`parseJUnitXml` (`junit.ts:134-135`) on 80_000 unclosed `<testsuite ` prefixes (~880KB) took **48.23s** real / 47.33s user via `junit merge-local`, then returned empty results. The API does not parse XML, so this stalls the CLI (and any CI job that runs it), not the Node server directly.

**Fix:** Reject input over a size cap, and use a parser with a node budget. Abort if no well-formed root is found.

---

## Held (not bugs)

- Bearer auth is required on all four CI routes. Wrong, empty, scheme-less, lowercase, Basic, and query-string tokens are 401. The query token was not echoed.
- Custom entities and billion-laughs were not expanded. A local marker file and `file:///etc/hostname` were not read. Do not treat the regex decoder as an XML stack; it is unsafe in the ways above, not via XXE.
- Second complete, and a shard after complete, return 409.
- Negative and zero shard indexes, empty results, and missing required JSON fields return 400.

---

## Highest severity

1. Parser false greens: a failed case is stored and reported `passRate: 100` if output contains `</testcase>`, and nested suites drop sibling failures (`junit.ts:100-101`, `134-135`). Proven persisted on run `dace1d6b-9533-464c-91c1-21a5884e033c`.
2. Complete/junit mark the run completed and return a green or empty summary while shards are missing or DB rows still contain failures (`complete/route.ts:40-75`, `junit/route.ts:101-123`). Runs `342a81f1-…`, `ecca9d7f-…`, `1573a364-…`, `8ebf5d56-…`.
3. Concurrent shard ingest commits duplicate shard and result rows, then returns 500 (`ci-ingest.ts:182-207`, `24`). Run `cdb608bf-b578-4495-9006-0f05429314dd`, `shardsReceived: 8` of 1.

```json
[
  {
    "id": "BUGHUNT-CI-false-green-testcase-close",
    "severity": "critical",
    "title": "JUnit regex treats </testcase> in output as the end of the case and drops the failure",
    "area": "ci-ingest",
    "file": "packages/domain/src/junit.ts:101",
    "repro_summary": "CLI junit submit of a failing testcase whose system-out contains the characters </testcase> before the failure element. Run dace1d6b-9533-464c-91c1-21a5884e033c stored auth::should-fail as passed with passRate 100 and status completed."
  },
  {
    "id": "BUGHUNT-CI-nested-suite-drops-failure",
    "severity": "critical",
    "title": "Nested testsuite match drops sibling cases, including failures",
    "area": "ci-ingest",
    "file": "packages/domain/src/junit.ts:135",
    "repro_summary": "merge-local an outer testsuite that contains an inner testsuite and a later failing sibling. Only the inner passing case is returned; passRate is 100 and the failure is absent."
  },
  {
    "id": "BUGHUNT-CI-complete-partial-or-empty",
    "severity": "critical",
    "title": "Complete succeeds with zero or partial shards and reports a green or empty summary",
    "area": "ci-ingest",
    "file": "src/app/api/ci/runs/[id]/complete/route.ts:51",
    "repro_summary": "POST /api/ci/runs with shardTotal 3, then POST complete with no shards. Run 342a81f1-7e13-429d-b6bc-c04cd70fdf24 is completed, shardsReceived 0, passRate null. Completing 1 of 4 shards (ecca9d7f-019c-4129-9759-e712ce80012f) is completed with passRate 100."
  },
  {
    "id": "BUGHUNT-CI-stale-result-false-summary",
    "severity": "critical",
    "title": "Resubmitted shard leaves the old failure stored while complete returns passRate 100",
    "area": "ci-ingest",
    "file": "src/lib/ci-ingest.ts:61",
    "repro_summary": "Submit shard 1 with a pass and a fail, resubmit shard 1 with only the pass, then complete. Run 1573a364-e2be-4268-a754-323535d3bc92 HTTP summary is total 1 passed; agent results still include BUGHUNT-CI::stale-fail failed. Webhook summary counts DB rows, not the HTTP summary."
  },
  {
    "id": "BUGHUNT-CI-junit-bypasses-shards",
    "severity": "high",
    "title": "JUnit submit to an in-progress sharded run completes it and hides the shard failure in the summary",
    "area": "ci-ingest",
    "file": "src/app/api/ci/junit/route.ts:101",
    "repro_summary": "Create shardTotal 3, POST one failed shard, then POST /api/ci/junit with runId and a single pass. Run 8ebf5d56-f716-4581-b325-a90c9ed3c920 is completed, shardsReceived forced to 1, response passRate 100, but both the shard failure and the junit pass are stored."
  },
  {
    "id": "BUGHUNT-CI-comment-and-cdata-ingested",
    "severity": "high",
    "title": "XML comments and CDATA are parsed as real testcases",
    "area": "ci-ingest",
    "file": "packages/domain/src/junit.ts:101",
    "repro_summary": "junit submit of a comment containing a failed testcase. Run 6424a6bd-bc77-4fd3-ba44-317afbf45333 stored ghost::commented as failed. A CDATA blob with </testcase><testcase>…planted-failure… becomes an extra failed result."
  },
  {
    "id": "BUGHUNT-CI-skipped-hides-failure",
    "severity": "high",
    "title": "A skipped child hides a failure; a failure tag in system-out fails a passing test",
    "area": "ci-ingest",
    "file": "packages/domain/src/junit.ts:73",
    "repro_summary": "A testcase with both skipped and failure normalizes to skipped (passRate null, failure notes dropped). A passing testcase whose system-out contains a raw <failure> element normalizes to failed."
  },
  {
    "id": "BUGHUNT-CI-case-key-silent-overwrite",
    "severity": "high",
    "title": "80-char case key truncation overwrites a different test instead of 500ing",
    "area": "ci-ingest",
    "file": "src/lib/ci-ingest.ts:16",
    "repro_summary": "Two shard results whose sanitized external keys share the first 80 characters. Run 25d2f9da-3212-4bae-8e13-da4a84cdd681 shard response summary says total 2, but only the second (failed) result is stored. Sequential path does not 500."
  },
  {
    "id": "BUGHUNT-CI-concurrent-shard-500",
    "severity": "high",
    "title": "Concurrent shard posts duplicate shard rows, duplicate results, and return 500 without rollback",
    "area": "ci-ingest",
    "file": "src/lib/ci-ingest.ts:187",
    "repro_summary": "12 parallel POSTs of shardIndex 1 on run cdb608bf-b578-4495-9006-0f05429314dd. 11 responses are 500 (cases_workspace_id_key_unique at ci-ingest.ts:24). shardsReceived stays 8 on shardTotal 1. A later resubmit does not collapse the duplicate shard rows. Distinct-index race 0d3763e3-0761-42ff-b1db-fdc3ed457425 stored 16 rows and shardsReceived 6 of 8."
  },
  {
    "id": "BUGHUNT-CI-duplicate-keys-triple-insert",
    "severity": "high",
    "title": "Duplicate external keys insert multiple run_results; API summary counts all of them",
    "area": "ci-ingest",
    "file": "src/lib/ci-ingest.ts:61",
    "repro_summary": "POST /api/ci/junit with three results sharing BUGHUNT-CI::dupkey. Run 8ff821b4-4c63-43b0-9561-da86e6033c5f summary total 3 passRate 33 and three stored rows. CLI merge-local collapses the same situation to one row; junit submit does not."
  },
  {
    "id": "BUGHUNT-CI-shard-index-unbounded",
    "severity": "medium",
    "title": "Shard index is not bounded by shardTotal and can 500 past int4",
    "area": "ci-ingest",
    "file": "src/app/api/ci/runs/[id]/shards/route.ts:20",
    "repro_summary": "POST shardIndex 999999 on a shardTotal 2 run returns 200 and stores the result. shardIndex 2147483648 returns 500. Overlapping keys are last-index-wins, so a higher shard can erase a failure (run 89d4291e-008c-42e8-9388-d20128bf3dee, BUGHUNT-CI::overlap stayed passed)."
  },
  {
    "id": "BUGHUNT-CI-single-quote-unknown",
    "severity": "medium",
    "title": "Single-quoted JUnit attributes are dropped and collapse into externalKey unknown",
    "area": "ci-ingest",
    "file": "packages/domain/src/junit.ts:44",
    "repro_summary": "merge-local a testcase with classname='AuthSuite' name='login_single'. Result is externalKey unknown, empty name, status passed. A second nameless case shares that key."
  },
  {
    "id": "BUGHUNT-CI-partial-write-500",
    "severity": "medium",
    "title": "Invalid JSON, bad UUIDs, and oversized durationMs return empty 500; overflow already inserted a run",
    "area": "ci-ingest",
    "file": "src/app/api/ci/junit/route.ts:45",
    "repro_summary": "POST non-JSON to /api/ci/junit or /api/ci/runs, or a non-UUID on shards/complete: 500 empty body. durationMs 9999999999999 on the second result 500s after creating run 6574a764-7160-4c10-a8bf-00d693a8cd2d in_progress with only the first result stored. Negative duration and 50k notes are accepted."
  },
  {
    "id": "BUGHUNT-CI-cli-shards-coerce",
    "severity": "medium",
    "title": "CLI turns invalid --shards into 1 and does not align 0-based shards or empty XML with the API",
    "area": "ci-ingest",
    "file": "packages/cli/src/index.ts:131",
    "repro_summary": "topology runs create --shards abc created run c289600d-9d09-407a-967b-b762fcc2bbe7 with shardTotal 1. --shard 0 is HTTP 400. merge-local on an empty suite exits 0; junit submit of the same file is HTTP 400."
  },
  {
    "id": "BUGHUNT-CI-regex-redos",
    "severity": "medium",
    "title": "Unclosed testsuite markup stalls the CLI parser for tens of seconds",
    "area": "ci-ingest",
    "file": "packages/domain/src/junit.ts:135",
    "repro_summary": "junit merge-local on ~880KB of 80000 unclosed <testsuite prefixes took 48.23s CPU and returned empty results. XXE and billion-laughs entities were not expanded."
  }
]
```
