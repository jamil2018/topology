# Reports, search, saved views, hub pulse bug hunt

Date: 2026-09-17. Live `http://127.0.0.1:4317` (`next dev`) as `demo@topology.local`. Scope: `/reports`, `/reports/[id]`, `GET /api/search`, `GET/POST /api/views`, `DELETE /api/views/[id]`, hub quality pulse, and pending work (`GET /api/agent?resource=whats_pending`, `GET /api/triage`, `GET /api/milestones?active=1`). No code changes, no seed/migrate/restart.

Saved views were prefixed `BUGHUNT-VIEW-`. The 1.5MB fixture `BUGHUNT-VIEW-huge` (`a23710e0-9d94-465a-a6ae-612f1cc5f00b`) was deleted after the write was confirmed. Leftovers in project Topology (`3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf`): `BUGHUNT-VIEW-alpha` twice (`67650c20-e7f7-4174-853b-5d392109dca0`, `3e28ae14-36df-4f7f-913a-b618d9b59473`), `BUGHUNT-VIEW-proto` (`c3e2ee40-5d1c-4398-a689-2cf9baf3f0a8`), `BUGHUNT-VIEW-proto2` (`1cd37daa-ec96-4691-8c0b-0aa37c62b3a1`), and `BUGHUNT-VIEW-'; DROP TABLE saved_views; --` (`1ffe0e9d-8215-4302-bf56-c7740d1077ea`).

---

## Highest severity

1. **BH-RPT-001 (high)** — Hub milestone gate says the suite is 0% executed / no pass rate. Suite case `TOP-1` has a `passed` result dated 2026-09-13. Postgres `ORDER BY executed_at DESC` puts null timestamps first, so an untested row wins over the real pass.
2. **BH-RPT-002 (high in this dev server, medium in production)** — `/reports/not-a-uuid` does not 404. The signed-in page renders the raw Drizzle/Postgres query (`invalid input syntax for type uuid`).
3. **BH-RPT-003 (medium)** — Pending work reports 50 untested results while the run APIs have 131. No truncated flag.

Report list and detail KPIs matched raw result counts. Hub pass/fail (`55 pass · 32 fail`, `63%`) matched a full sum of `/api/runs/:id` results. No `NaN` / `Infinity` on `/` or `/reports`.

---

## Coverage

| Attempt | Result |
| --- | --- |
| Search, no session: empty, `a`, `%`, `\`, `' OR 1=1 --` | **307** to `/login`, not JSON 401. BH-RPT-008. Handler 401 is unreachable (same class as BH-CASES-010). |
| Search session: missing `q`, empty, spaces | **200** `{cases:[],runs:[],folders:[]}`. |
| Search `' OR 1=1 --`, `'; DROP TABLE cases; --`, `<script>`, unicode, `__proto__` | **200** empty. Parameterized. No injection. |
| Search `%`, `_`, `%_%` | **200** and full capped lists (8 cases / 6 runs / 4 folders). Nonsense token **200** empty. BH-RPT-005 (same class as BH-CASES-012). |
| Search `\` and `foo\` | **200** empty. Trailing backslash did not 500. |
| Search `a\u0000b` | **500**, body length 0. BH-RPT-004. |
| Search 20k and 200k | **431**, body length 0. BH-RPT-012. |
| Views no session GET/POST/DELETE | **307** to `/login`. BH-RPT-008. |
| View invalid sort, config string, config array, missing/bad entity, blank name | **400**. |
| View `__proto__` / `constructor.prototype` in config and body | **201**. Stored config has only schema keys. `polluted` not echoed. Not pollution. |
| View name with SQL text | **201**, stored as text. Table still there. |
| Duplicate name `BUGHUNT-VIEW-alpha` | Both **201**. BH-RPT-007. |
| View `config.search` 1.5MB | **201**, then `GET /api/views` returned `search` length 1500000. BH-RPT-006. Deleted afterward. |
| DELETE non-uuid | **400** `Invalid view id`. |
| DELETE unknown uuid | **404** `View not found`. |
| DELETE own view with other project header `8f861e9a-…` | `View not found`. View still listed. Isolation held. Only one workspace member, so a second user's view id was not available. |
| `/reports` and query `kind` / `q` / `filter` injection | **200**. Those params are ignored. No 500. |
| `/reports/` | **308** to `/reports`. |
| `/reports/not-a-uuid`, `/reports/undefined`, `/reports/null`, `/reports/%00` | Error boundary, SQL in the page. BH-RPT-002. |
| `/reports/00000000-0000-0000-0000-000000000000` and an in-progress run id | Not-found page, no SQL. |
| Completed run id with project cookie for Test (`8f861e9a-…`) | Shell switches to Test. Foreign run name not rendered. |
| Completed-run list P/F and detail KPIs vs `GET /api/runs/:id` | Matched (pass rate = round(passed / (passed+failed) × 100); 0 executed shows `—` / `n/a`). |
| Hub pulse vs all run-result rows and `/api/cases` | Pass/fail, rate, ready/total, blocked/draft, active runs matched. Deprecated (1) omitted from the subtitle. BH-RPT-011. |
| Milestone gate vs latest timestamped result in folder `85ff3414-…` | UI `executed 0%`. Ground truth 1/2 executed (`TOP-1` passed). BH-RPT-001. |
| `whats_pending` vs result rows and `/api/triage` | Untested list 50 vs 131 rows. Failures-without-issue 26 vs triage queue 13. BH-RPT-003, BH-RPT-009. Retest queue 0 on hub and API. |
| Browser Playwright `userDataDir=/tmp/bughunt-reports`: `/`, `/reports`, Meta+K palette | `/` and `/reports` load had no console errors and no `NaN`. Palette opened (dialog). One `pageerror` on negative `performance.measure` for `ReportDetailPage`. BH-RPT-010. |

---

## Bugs

### BH-RPT-001 — Milestone gate counts 0% executed while the suite has a pass

- **Severity:** high
- **Steps:** On project Topology, open `/`. Note milestone `v1 launch gate`: `Execution progress 0% is below the 80% gate · executed 0%`. `GET /api/milestones?active=1` returns `executedPct: 0`, `passRate: null`, `score: 70`, `status: no_go`. The milestone `folderId` is `85ff3414-0e7d-48da-88e7-5efbae25413c`. Cases in that folder include `TOP-1` (`c5dc0527-c153-4039-8812-1f7eb317c969`). Its results include `passed` at `2026-09-13T10:04:36.505Z` (`6962466e-33b7-44f9-bdb3-cae3f8855776`, run `Passed result 1789293876503`) and several `untested` rows with `executedAt: null` (including older `Local smoke — bootstrap`).
- **Expected:** Latest execution by timestamp is `passed`. One of two non-deprecated suite cases executed → `executedPct` 50, pass rate 100%. Untested rows with a null timestamp must not outrank a real execution.
- **Actual:** Gate says 0% executed and pass rate null. Hub copies that into the quality-pulse milestone card.
- **Evidence:** Same-moment hub text `Execution progress 0% is below the 80% gate · executed 0%`. API `readiness.executedPct === 0`. `TOP-1` passed result timestamp is later than every dated failure/pass for that case. Postgres `ORDER BY executed_at DESC` is `NULLS FIRST`, so any null `executedAt` sorts before `2026-09-13`. The loop keeps the first row per case.
- **File:** `src/lib/queries.ts:391` (also `src/components/hub-pulse.tsx:340`)
- **Suggested fix:** `orderBy(sql`${runResults.executedAt} desc nulls last`)` and ignore null `executedAt` when choosing the latest outcome. Do not treat an untested placeholder as newer than a timestamped pass.

### BH-RPT-002 — Non-uuid report id crashes and shows the SQL

- **Severity:** high on this `next dev` server (medium if production digests the message)
- **Steps:** Sign in. Open `/reports/not-a-uuid` (also `/reports/undefined`, `/reports/null`, `/reports/%00`).
- **Expected:** 404, same as a zero UUID or an in-progress run id (`getRunReport` returns null → `notFound()`).
- **Actual:** Segment error boundary. Visible text starts `Reports failed to load` and includes `Failed query: select "runs"."id", … "runs_results"."data" as "results"`. HTTP status of the document is 200 (Next error page), not 404.
- **Evidence:** Playwright body text on `/reports/not-a-uuid` contains `Failed query: select "runs"`. Zero UUID and an incomplete run id did not include that query. Page does not check UUID before `eq(runs.id, id)`.
- **File:** `src/app/(app)/reports/[id]/page.tsx:20` and `src/app/(app)/reports/error.tsx:21`
- **Suggested fix:** Reject non-UUIDs with `notFound()` before the query. Do not render `error.message` (it is the Drizzle query in dev).

### BH-RPT-003 — Pending untested work stops at 50 with no more-flag

- **Severity:** medium
- **Steps:** `GET /api/agent?resource=whats_pending` with `Authorization: Bearer topo_demo_token_local_dev_only`. Sum `status === "untested"` across every `GET /api/runs/:id` in the same project.
- **Expected:** The pending list length equals the untested row count, or the payload says it was truncated.
- **Actual:** `untestedResults.length` is 50. Result rows totaled 131 untested (217 results: 54 passed, 32 failed, 131 untested at that snapshot).
- **Evidence:** Paired counts from one session: agent list 50, run-detail sum 131. Query uses `limit: 50` and no `orderBy`.
- **File:** `src/lib/issues.ts:337`
- **Suggested fix:** Return a total plus a cursor, or raise the cap and order by newest. Do not silently drop 81 rows.

### BH-RPT-004 — NUL in the search query is an empty 500

- **Severity:** medium
- **Steps:** Signed-in `GET /api/search?q=` + `encodeURIComponent("a\u0000b")`.
- **Expected:** 400, or 200 empty results. Other special characters already return 200 empty.
- **Actual:** **500**, `content-length` 0, not JSON.
- **Evidence:** Playwright request status 500, body `""`, length 0. `q` is interpolated into `%${q}%` and passed to `ilike` with no catch.
- **File:** `src/app/api/search/route.ts:27`
- **Suggested fix:** Reject NUL and wrap the three queries so a driver error becomes 400, not an empty 500.

### BH-RPT-005 — Search treats `%` and `_` as wildcards

- **Severity:** medium (command-palette correctness; same class as BH-CASES-012)
- **Steps:** `GET /api/search?q=%25`, `q=_`, `q=%25_%25`. Compare to `q=zzzz-bughunt-no-match-9f3a`.
- **Expected:** Literal substring match, or escaped LIKE metacharacters.
- **Actual:** `%` and `_` return the capped lists (8 cases, 6 runs, 4 folders). The nonsense token returns empty. SQL-looking strings return empty (not injection).
- **Evidence:** Those three wildcard queries were 200 with full caps. Nonsense was 200 with zero hits.
- **File:** `src/app/api/search/route.ts:27`
- **Suggested fix:** Escape `\`, `%`, and `_` before wrapping the pattern in `%…%`.

### BH-RPT-006 — Saved view config has no size cap

- **Severity:** medium
- **Steps:** `POST /api/views` `{ name: "BUGHUNT-VIEW-huge", entity: "cases", config: { search: "Z".repeat(1_500_000) } }`. Then `GET /api/views`.
- **Expected:** 400 once config exceeds a small limit (name is already capped at 80).
- **Actual:** **201**. List payload included `config.search` length 1500000. Zod `z.string()` on `search` / `folderFilter` / filters has no `.max()`.
- **Evidence:** Create response id `a23710e0-9d94-465a-a6ae-612f1cc5f00b`. List entry `searchLen: 1500000`. Deleted after confirmation (`{ ok: true }`).
- **File:** `src/lib/saved-views.ts:8` and `src/app/api/views/route.ts:112`
- **Suggested fix:** `.max()` on every config string (a few KB) and reject oversized bodies before insert.

### BH-RPT-007 — Duplicate view names are both stored

- **Severity:** low
- **Steps:** `POST /api/views` twice with name `BUGHUNT-VIEW-alpha`, entity `cases`. `GET /api/views`.
- **Expected:** 409 on the second name, or the UI distinguishes them.
- **Actual:** Both **201**. List shows the same name twice (`67650c20-…` and `3e28ae14-…`). No unique index on `(workspace_id, created_by_id, entity, name)` in `drizzle/0005_saved_views_case_activities.sql`.
- **Evidence:** Two rows, identical `name`, different ids and different `config.search` (`login` vs `other`).
- **File:** `src/app/api/views/route.ts:106` and `src/components/saved-views-bar.tsx:118`
- **Suggested fix:** Unique constraint and 409. Show a disambiguator in the bar.

### BH-RPT-008 — Unauthenticated search and views redirect instead of 401

- **Severity:** low (same middleware class as BH-CASES-010)
- **Steps:** No cookies. `GET /api/search`, `GET/POST /api/views`, `DELETE /api/views/:uuid`. `maxRedirects: 0`.
- **Expected:** JSON 401 from the route handlers.
- **Actual:** **307** to `/login?callbackUrl=...`. `/api/agent` is allowlisted and does return 401; search and views are not.
- **Evidence:** `search-empty` location `/login?callbackUrl=http://localhost:4317/api/search`. Views POST the same.
- **File:** `src/auth.config.ts:30` (matcher `src/middleware.ts:7`)
- **Suggested fix:** For `/api/*` except auth/CI/health, return JSON 401 instead of redirecting.

### BH-RPT-009 — Pending failures and hub triage disagree

- **Severity:** medium
- **Steps:** Same session: hub chip `13 OPEN TRIAGE`, `GET /api/triage` queue length 13, `whats_pending.failuresWithoutIssue.length` 26. Retest was 0 on both.
- **Expected:** One pending-failure number, or labels that do not both mean "awaiting triage".
- **Actual:** Hub/triage count open triage items (13). Pending work counts failed/blocked result rows without a linked issue (26), and that query is also `limit: 50` unordered so it can drift further.
- **Evidence:** Paired later snapshot: triage API 13, hub `13 OPEN TRIAGE`, agent failures 26. 26 is under the 50 cap, so this is not BH-RPT-003's truncation.
- **File:** `src/lib/issues.ts:344` and `src/lib/queries.ts:63` (`triageOpen` is `count(*)` of open triage items, shown at `src/components/hub-pulse.tsx:221`)
- **Suggested fix:** Drive the hub chip and `whats_pending` from the same query, and return totals separately from the page of rows.

### BH-RPT-010 — Report detail performance mark throws in the console

- **Severity:** low
- **Steps:** Playwright persistent context. Open `/reports`, then Meta+K (palette opened).
- **Expected:** No `pageerror`.
- **Actual:** `TypeError: Failed to execute 'measure' on 'Performance': 'ReportDetailPage' cannot have a negative time stamp.` `/` and the `/reports` list navigation themselves were clean. No `NaN` in the UI.
- **Evidence:** Console listener on the palette turn. Palette dialog was present.
- **File:** next dev instrumentation naming `ReportDetailPage` (no app `performance.measure` call). `src/app/(app)/reports/[id]/page.tsx:11`
- **Suggested fix:** Confirm in a production build. If the mark is app code, guard negative durations.

### BH-RPT-011 — Pulse case subtitle drops deprecated

- **Severity:** low
- **Steps:** Hub `54/69` and `1 blocked · 13 draft`. `GET /api/cases` statuses at the same window: ready 54, draft 13, blocked 1, deprecated 1 (69).
- **Expected:** Ready/total is correct (it is). The subtitle should not look like a full breakdown, or it should mention deprecated.
- **Actual:** 54+1+13 = 68, not 69. The missing case is deprecated. Not a divide-by-zero (total > 0; bar width is ready/total).
- **Evidence:** Hub text `54/69` and `1 blocked · 13 draft` next to the case status tally.
- **File:** `src/components/hub-pulse.tsx:392`
- **Suggested fix:** Include deprecated in the line, or label the line as a partial status mix.

### BH-RPT-012 — Huge search URL is an empty 431

- **Severity:** low
- **Steps:** Signed-in `GET /api/search?q=` + 20_000 `A`s, and 200_000 `B`s.
- **Expected:** 400 with a short error, or a truncated query that still returns JSON.
- **Actual:** **431**, body length 0, in a few milliseconds.
- **Evidence:** Both calls status 431, summary empty.
- **File:** `src/app/api/search/route.ts:22` (no max length before the driver; the 431 is the platform rejecting the URL)
- **Suggested fix:** Cap `q` (for example 200) and return 400 JSON.

---

## Not bugs

- Prototype pollution keys were stripped by the view schema. No `polluted` on create or list.
- SQL-looking search strings and a SQL view name did not execute. Tables still listed.
- Cross-project delete of an owned view returned not found and the view remained. A completed run id was not rendered after switching the project cookie to Test.
- Empty search is 200 empty, not a dump.
- Report KPIs and hub pass rate matched raw passed/failed sums (denominator is passed+failed only; skipped/blocked were 0 in this dataset). `—` / `n/a` when nothing was executed. No divide-by-zero in the pulse bar.
- Invalid view JSON/sort/entity is 400 with a field message.

```json
[
  {
    "id": "BH-RPT-001",
    "severity": "high",
    "title": "Hub milestone gate says 0% executed while TOP-1 passed",
    "steps": "Open /. Read v1 launch gate. GET /api/milestones?active=1. Compare folder 85ff3414-0e7d-48da-88e7-5efbae25413c cases to GET /api/runs/:id results for TOP-1.",
    "expected": "Latest timestamped outcome is passed (2026-09-13T10:04:36.505Z). executedPct 50, pass rate 100.",
    "actual": "executedPct 0, passRate null, hub text Execution progress 0% … executed 0%. Null executedAt sorts first on DESC.",
    "evidence": "TOP-1 c5dc0527-c153-4039-8812-1f7eb317c969 result 6962466e passed at 2026-09-13T10:04:36.505Z plus untested rows with executedAt null. Milestone readiness.executedPct 0, score 70.",
    "file": "src/lib/queries.ts:391",
    "suggested_fix": "ORDER BY executed_at DESC NULLS LAST and ignore null timestamps when picking lastResult."
  },
  {
    "id": "BH-RPT-002",
    "severity": "high",
    "title": "Non-uuid report id crashes and renders the SQL",
    "steps": "Open /reports/not-a-uuid while signed in.",
    "expected": "404, like a zero UUID.",
    "actual": "Error boundary shows Failed query: select runs… including the results lateral join. Document status 200.",
    "evidence": "Playwright body on /reports/not-a-uuid contains Failed query: select \"runs\". Zero UUID and an in-progress run id did not.",
    "file": "src/app/(app)/reports/[id]/page.tsx:20",
    "suggested_fix": "notFound() unless the id is a UUID. Do not render error.message."
  },
  {
    "id": "BH-RPT-003",
    "severity": "medium",
    "title": "whats_pending untested list is silently capped at 50",
    "steps": "GET /api/agent?resource=whats_pending with the demo bearer token. Sum untested results from every GET /api/runs/:id.",
    "expected": "List length equals the untested count, or a truncated flag plus total.",
    "actual": "untestedResults.length 50. Run-detail sum 131 untested.",
    "evidence": "Paired snapshot: agent 50, result rows 131 untested of 217.",
    "file": "src/lib/issues.ts:337",
    "suggested_fix": "Return total and a cursor. Order the page."
  },
  {
    "id": "BH-RPT-004",
    "severity": "medium",
    "title": "NUL in search query is an empty 500",
    "steps": "GET /api/search?q=a%00b while signed in.",
    "expected": "400 or 200 empty JSON.",
    "actual": "500, body length 0.",
    "evidence": "Playwright status 500, text length 0. Other special characters were 200 empty.",
    "file": "src/app/api/search/route.ts:27",
    "suggested_fix": "Reject NUL and catch driver errors."
  },
  {
    "id": "BH-RPT-005",
    "severity": "medium",
    "title": "Search does not escape LIKE wildcards",
    "steps": "GET /api/search?q=%25 and q=_ versus a nonsense token.",
    "expected": "Literal match.",
    "actual": "% and _ return the capped hit lists. Nonsense is empty. SQL strings are empty.",
    "evidence": "200 with 8 cases, 6 runs, 4 folders for % and _. Nonsense 200 with zeros.",
    "file": "src/app/api/search/route.ts:27",
    "suggested_fix": "Escape backslash, percent, and underscore before ilike."
  },
  {
    "id": "BH-RPT-006",
    "severity": "medium",
    "title": "Saved view config accepts a 1.5MB string",
    "steps": "POST /api/views name BUGHUNT-VIEW-huge with config.search of 1.5 million Zs. GET /api/views.",
    "expected": "400. Name is already max 80.",
    "actual": "201. List echoed search length 1500000. Deleted after the check.",
    "evidence": "View a23710e0-9d94-465a-a6ae-612f1cc5f00b, searchLen 1500000, then DELETE ok.",
    "file": "src/lib/saved-views.ts:8",
    "suggested_fix": "Max length on config strings before insert."
  },
  {
    "id": "BH-RPT-007",
    "severity": "low",
    "title": "Duplicate saved view names are both stored",
    "steps": "POST BUGHUNT-VIEW-alpha twice. GET /api/views.",
    "expected": "409 or a disambiguated name.",
    "actual": "Two 201s, same name, different ids.",
    "evidence": "67650c20-e7f7-4174-853b-5d392109dca0 and 3e28ae14-36df-4f7f-913a-b618d9b59473.",
    "file": "src/app/api/views/route.ts:106",
    "suggested_fix": "Unique (workspace, user, entity, name) and 409."
  },
  {
    "id": "BH-RPT-008",
    "severity": "low",
    "title": "Unauthenticated search and views 307 to login instead of 401",
    "steps": "GET /api/search and POST /api/views with no cookies and maxRedirects 0.",
    "expected": "JSON 401.",
    "actual": "307 Location /login?callbackUrl=…",
    "evidence": "search-empty location /login?callbackUrl=http://localhost:4317/api/search.",
    "file": "src/auth.config.ts:30",
    "suggested_fix": "JSON 401 for /api/* when logged out."
  },
  {
    "id": "BH-RPT-009",
    "severity": "medium",
    "title": "Hub triage count and pending failures disagree",
    "steps": "Compare hub open-triage chip, GET /api/triage, and whats_pending.failuresWithoutIssue.",
    "expected": "One number, or labels that are not both awaiting triage.",
    "actual": "Hub and triage API 13. Pending failures 26. Retest 0 on both.",
    "evidence": "Later snapshot: chip 13 OPEN TRIAGE, queue length 13, failuresWithoutIssue 26 (under the 50 cap).",
    "file": "src/lib/issues.ts:344",
    "suggested_fix": "Share one pending-failure query between the hub and the agent resource."
  },
  {
    "id": "BH-RPT-010",
    "severity": "low",
    "title": "Report detail page throws a negative performance.measure",
    "steps": "Playwright on /reports, press Meta+K.",
    "expected": "No pageerror. Palette may open.",
    "actual": "pageerror: Performance measure ReportDetailPage cannot have a negative time stamp. Palette dialog did open. / and /reports list loads had no console errors.",
    "evidence": "Console listener after Meta+K on http://127.0.0.1:4317/reports.",
    "file": "src/app/(app)/reports/[id]/page.tsx:11",
    "suggested_fix": "Re-check in a production build; guard the mark if it is ours."
  },
  {
    "id": "BH-RPT-011",
    "severity": "low",
    "title": "Pulse case line omits deprecated so the mix does not sum to total",
    "steps": "Read hub cases widget and GET /api/cases status counts.",
    "expected": "54/69 ready is fine. Subtitle should account for deprecated or not look exhaustive.",
    "actual": "1 blocked · 13 draft plus 54 ready is 68, not 69. The missing case is deprecated. No NaN.",
    "evidence": "Hub 54/69 and 1 blocked · 13 draft. Case API ready 54, draft 13, blocked 1, deprecated 1.",
    "file": "src/components/hub-pulse.tsx:392",
    "suggested_fix": "Show deprecated in the subtitle."
  },
  {
    "id": "BH-RPT-012",
    "severity": "low",
    "title": "Oversized search query is an empty 431",
    "steps": "GET /api/search?q= with 20000 and 200000 characters.",
    "expected": "400 JSON.",
    "actual": "431, empty body.",
    "evidence": "Both calls status 431, length 0, under 5ms.",
    "file": "src/app/api/search/route.ts:22",
    "suggested_fix": "Cap q and return 400."
  }
]
```
