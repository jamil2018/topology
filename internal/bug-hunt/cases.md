# Cases CRUD bug hunt

Date: 2026-09-17. Live `http://127.0.0.1:4317` as `demo@topology.local`. Scope: `POST/GET/PATCH/DELETE /api/cases`, `GET /api/cases/:id`, `PATCH /api/cases` (bulk), `GET /api/cases/:id/activity`, plus list/search query params the cases UI and `/api/search` actually honor. No code changes, no seed/migrate.

Created cases were prefixed `BUGHUNT-CASES-`. Seeded demo cases were not deleted. Leftover fixtures (please remove when convenient): those prefixed cases in the default project, `BUGHUNT-CASES-foreign` in project `Test` (`8f861e9a-6cdc-4d2d-a1e7-52fdd7de8de7`), a whitespace-only key (`"   "`), and run `BUGHUNT-CASES-run-delete-ref` (`434f400f-595a-4258-8857-15d81726e5f2`, now result-less). `BUGHUNT-CASES-bigsteps` and a 100k tag on `BUGHUNT-CASES-good` make `GET /api/cases` about 2.2MB until removed.

---

## Coverage

| Attempt | Result |
| --- | --- |
| Create missing title, `""`, `null` title, wrong types, `priority: -1` / `0`, 241- and 100k-char title | **400** (zod). Not a bug. |
| Create whitespace-only title and whitespace-only key | **201**. Bug BH-CASES-008. |
| Extra fields on create/PATCH (`role`, `workspaceId`, `workspace_id`, `id`) | Stripped. Id and workspace unchanged. Not mass-assignment of those fields. Unknown `assigneeId` is applied and 500s (BH-CASES-002). |
| Duplicate key, including concurrent double create | Second insert **500** with SQL text, not 409. Bug BH-CASES-002. `BUGHUNT-CASES-good` and `BUGHUNT-CASES-GOOD` and `BUGHUNT-CASES-good ` all created. Bug BH-CASES-008. |
| PATCH missing UUID | **404**. Invalid id **400**. |
| PATCH/GET/DELETE a case in the other project, including a random `x-topology-project-id` | **404**. Isolation held. |
| DELETE then GET, double DELETE | **404** after the first delete. Correct. |
| DELETE while referenced by a failed run result | **200**, result row gone. Bug BH-CASES-001. |
| Bulk empty `caseIds`, missing fields, 501 ids, status injection, non-uuid folder, missing folder | **400** / **404** as appropriate. |
| Bulk mixed valid id + other-workspace id | **200** `updated: 1`, foreign case unchanged. Silent partial write. Bug BH-CASES-006. |
| Concurrent bulk tag `add` | Both **200**, final tags dropped one side. Bug BH-CASES-003. Concurrent status is last-write-wins (both 200); not filed separately. |
| Activity missing cookie | **307** to `/login`, not JSON 401. Bug BH-CASES-010. |
| 90 status flips | Activity returns exactly 80 rows, no `hasMore`, create event gone. Bug BH-CASES-007. |
| XSS in title/steps/expected/tags | Stored and echoed inside `application/json`. Cases page flight payload escapes to `\u003c…\u003e`. UI interpolates text (`cases-workspace.tsx` title/tags, `case-history-panel.tsx` summary, `case-edit-panel.tsx` values). No `dangerouslySetInnerHTML`. **Not stored XSS** in this app. CSV export does return the raw markup (BH-CASES-013). |
| `GET /api/cases?q=' OR 1=1--&page=999999999&offset=-1&sort=key;select pg_sleep(5)--` | **200**. Those params are ignored. `folderId` SQL-ish / `not-a-uuid` is a **500** (parameterized, injection did not run). Bug BH-CASES-004. |
| `/api/search?q=' OR 1=1; DROP TABLE cases; --` | **200** empty. Parameterized. `q=%` and `q=_` match every case. Bug BH-CASES-012. |
| Status `deprecated → ready → draft` and bulk status | All **200**. No transition machine. Bug BH-CASES-009. |
| POST `{not json` and empty body | Empty **500**. PATCH invalid JSON correctly **400**. Bug BH-CASES-011. |

---

## Bugs

### BH-CASES-001 — Deleting a case destroys run execution history

- **Severity:** high
- **Steps:** Create `BUGHUNT-CASES-runref` (`83bdd44c-60f3-4a2f-a273-d4da0451a143`). `POST /api/runs` with that `caseIds` entry (run `434f400f-595a-4258-8857-15d81726e5f2`). `PATCH /api/runs/:id` `{ caseId, status: "failed", notes: "BUGHUNT failure evidence should survive case delete" }`. Confirm the run has 1 failed result. `DELETE /api/cases/:id`. `GET /api/runs/:id`.
- **Expected:** Delete is rejected (409) while results exist, or the result is detached (`caseId` null) and status/notes survive.
- **Actual:** Delete returned 200. Run `results` went from 1 failed row (notes intact, result `99232fd3-678b-4929-b786-00f4447de6a1`) to `[]`. Case activity is also cascade-deleted.
- **Evidence:** Before: `resultCount: 1`, `status: "failed"`. After: `resultCount: 0`, `results: []`. Server never hit the delete `catch`.
- **File:** `src/db/schema.ts:282` (`run_results.case_id` `onDelete: "cascade"`); handler does not check references at `src/app/api/cases/[id]/route.ts:215`.
- **Suggested fix:** `ON DELETE RESTRICT` (or `SET NULL` plus a snapshot of key/title/status on the result). Refuse delete with 409 when any `run_results` row points at the case.

### BH-CASES-002 — Duplicate key and bad assignee return 500 and the SQL statement

- **Severity:** high
- **Steps:** `POST /api/cases` twice with key `BUGHUNT-CASES-good`. Separately, concurrent double-create of `BUGHUNT-CASES-collide`. Separately, `POST` with `assigneeId: "33333333-3333-4333-8333-333333333333"`.
- **Expected:** Duplicate key **409** `{ error: "Case key already exists" }`. Unknown assignee **400**, no query text.
- **Actual:** **500** `application/json`. Body is Drizzle's `Failed query: insert into "cases" ...` plus `params` including workspace id `3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf` and actor `35b1fc6b-91cd-4038-b22c-96bd2da6751f`. Postgres cause is `23505` `duplicate key value violates unique constraint "cases_workspace_id_key_unique"`, but that string lives on `err.cause`, not `err.message` (`Failed query: …`), so the 409 branch never matches. Same leak on the FK failure.
- **Evidence:** Response length 744 (duplicate) and 793 (assignee). Concurrent create: one 201, one 500 with the same query dump.
- **File:** `src/app/api/cases/route.ts:112`
- **Suggested fix:** Inspect `cause.code` (`23505` → 409, `23503` → 400). Never send `err.message` / query params to the client.

### BH-CASES-003 — Concurrent bulk tag-add loses a tag and both calls report success

- **Severity:** medium
- **Steps:** Create `BUGHUNT-CASES-race` with tags `["base"]`. In parallel, `PATCH /api/cases` `{ caseIds: [id], tags: ["alpha"], tagMode: "add" }` and the same with `["beta"]`.
- **Expected:** Final tags include `base`, `alpha`, and `beta`, or one request fails as a conflict.
- **Actual:** Response A: `tags: ["base","alpha"]`, `updated: 1`. Response B: `tags: ["base","beta"]`, `updated: 1`. Final GET: `["base","alpha"]`. `beta` was dropped. Read-modify-write is not locked or transactional; `.set(patch)` overwrites the whole array.
- **Evidence:** Both responses 200; final GET `tags: ["base","alpha"]`.
- **File:** `src/app/api/cases/route.ts:180` (load) and `src/app/api/cases/route.ts:227` (add-mode merge) through `src/app/api/cases/route.ts:250` (update, no transaction).
- **Suggested fix:** One transaction per case with `SELECT … FOR UPDATE`, or a single SQL `tags = tags || $1` union. Return 409 on conflict.

### BH-CASES-004 — `folderId` query that is not a UUID 500s the list

- **Severity:** medium
- **Steps:** `GET /api/cases?folderId=' OR 1=1; DROP TABLE cases; --` and `GET /api/cases?folderId=not-a-uuid`.
- **Expected:** 400. No server exception. SQL not executed as SQL (this part held: param `$3`).
- **Actual:** **500**, empty body, no `content-type`. Log: `PostgresError 22P02 invalid input syntax for type uuid` at `GET` `src/app/api/cases/route.ts:54`. `page`, `offset`, `limit`, `sort`, and `q` on this route are ignored (200) — not injection.
- **Evidence:** Both calls status 500, length 0. Dev log `GET /api/cases?folderId=not-a-uuid 500 in 18ms` and the DROP string as a bound parameter only.
- **File:** `src/app/api/cases/route.ts:52`
- **Suggested fix:** `z.string().uuid()` the query param; 400 otherwise. Do not pass raw strings into a uuid column.

### BH-CASES-005 — Unbounded steps/description/tags and an unpaginated list

- **Severity:** medium
- **Steps:** `POST /api/cases` with 100k `description`, 100k `steps`, 50k `expectedResult` (`BUGHUNT-CASES-bigsteps`). Bulk-replace tags on another case with a 100k string plus `""`. `GET /api/cases?page=999999999&offset=-1&limit=1`.
- **Expected:** Length caps; list honors page/limit.
- **Actual:** Create **201** (`stepsLen: 100000`, `descLen: 100000`). Bulk tag replace **200** (response ~100KB). List **200**, 2,269,267 bytes, 36 cases, page/offset/limit ignored. Title is capped at 240; free-text and bulk tags are not (`z.array(z.string())` with no max).
- **Evidence:** `GET /api/cases` `len: 2269267`. Create response `len: 250433`.
- **File:** `src/app/api/cases/route.ts:17` (no max on description/steps/expected); bulk tags `src/app/api/cases/route.ts:36`; `listCases` `src/lib/queries.ts:243` (no limit).
- **Suggested fix:** Cap text fields and tag item length (same as title or a documented higher limit). Paginate `GET /api/cases`. Reject empty tags.

### BH-CASES-006 — Bulk edit silently skips ids that are not in this workspace

- **Severity:** medium
- **Steps:** Create `BUGHUNT-CASES-foreign` in project Test. From the default project, `PATCH /api/cases` `{ caseIds: [localId, foreignId], status: "blocked" }`.
- **Expected:** 400 listing the unknown id (same rule as `POST /api/runs` when any case id is invalid). Foreign case unchanged.
- **Actual:** **200** `{ updated: 1 }` and only the local case. Foreign stayed `draft`. Isolation held; the API still reports success for an incomplete id list. A mixed list that is entirely unknown is 404; a partial match is 200.
- **Evidence:** `updated: 1`, cases array length 1, foreign GET `status: "draft"`.
- **File:** `src/app/api/cases/route.ts:180`
- **Suggested fix:** If `existing.length !== unique(caseIds).length`, 400 with the missing ids and write nothing.

### BH-CASES-007 — Activity history is silently cut at 80 rows

- **Severity:** medium
- **Steps:** Create `BUGHUNT-CASES-hist`. PATCH status draft/ready 90 times. `GET /api/cases/:id/activity`.
- **Expected:** Full history, or a cursor / `hasMore` so older rows (including `created`) are reachable.
- **Actual:** Exactly 80 rows. Response keys are only `activities`. Oldest row is `Status draft → ready` (`action: updated`). `action: "created"` is gone.
- **Evidence:** `count: 80`, `has created: false`.
- **File:** `src/app/api/cases/[id]/activity/route.ts:52`
- **Suggested fix:** `limit` + `cursor` query params and a `hasMore` flag. Do not drop the create event without saying so.

### BH-CASES-008 — Blank and lookalike keys/titles are accepted

- **Severity:** medium
- **Steps:** `POST` `{ key: "BUGHUNT-CASES-ws-title", title: "   \t  " }`. `POST` `{ key: "   ", title: "whitespace key" }`. `POST` keys `BUGHUNT-CASES-good`, `BUGHUNT-CASES-GOOD`, and `BUGHUNT-CASES-good ` (trailing space). PATCH the same case with `title: "   "`.
- **Expected:** Trim, reject empty key/title (400). Case-insensitive unique key per workspace.
- **Actual:** All three creates **201**. Stored title is `"   \t  "`. Stored key is three spaces. The three key variants all exist. PATCH whitespace title is **400** (`updateCaseSchema` trims; create schema does not). Create also accepts tags `["", "  ", "ok"]`.
- **Evidence:** 201 bodies with `title: "   \t  "` and `key: "   "`.
- **File:** `src/app/api/cases/route.ts:15` (title `.min(1)` without trim) and `src/app/api/cases/route.ts:15` `key`; unique index is exact match `src/db/schema.ts:245`.
- **Suggested fix:** `.trim().min(1)` on key and title (and tags). Unique index on `lower(btrim(key))` per workspace.

### BH-CASES-009 — Any case status can move to any other status

- **Severity:** low
- **Steps:** PATCH one case `deprecated`, then `ready`, then `draft`. Same with bulk `status`.
- **Expected:** If deprecated/blocked are terminal or gated, illegal transitions 409.
- **Actual:** Every enum value is accepted. `deprecated → ready` and `ready → draft` both **200**. No transition table in `buildCasePatch` or the bulk loop. Status *injection* (`ready'; DROP TABLE…`, `READY`) is correctly **400**.
- **Evidence:** Five sequential status PATCHes on `4752cf46-caf0-41c9-882c-50bdeb89b673` all 200, including `deprecated → draft`.
- **File:** `src/app/api/cases/[id]/route.ts:160` and `src/app/api/cases/route.ts:205`
- **Suggested fix:** If product wants a machine, reject edges such as `deprecated → ready` unless an explicit restore action is sent.

### BH-CASES-010 — Unauthenticated case APIs redirect to HTML login

- **Severity:** low
- **Steps:** `GET /api/cases`, `POST /api/cases`, `PATCH /api/cases`, and `GET /api/cases/:id/activity` with no cookie. Also with `Accept: application/json`.
- **Expected:** **401** `{ error: "Unauthorized" }` (what the route handlers return).
- **Actual:** **307** `Location: /login?callbackUrl=…`. Middleware returns false for non-auth API paths before the handler runs, so the 401 in each route is unreachable without a session cookie.
- **Evidence:** Status 307, body/location `/login?callbackUrl=http%3A%2F%2Flocalhost%3A4317%2Fapi%2Fcases`.
- **File:** `src/auth.config.ts:8` (`authorized`); handlers such as `src/app/api/cases/route.ts:42`.
- **Suggested fix:** For `pathname.startsWith("/api/")`, return a JSON 401 instead of redirecting to `/login`.

### BH-CASES-011 — Create with invalid JSON is an empty 500

- **Severity:** low
- **Steps:** `POST /api/cases` with body `{not json` and with an empty body.
- **Expected:** 400 `{ error: "Invalid JSON body" }`, matching this file's PATCH handler.
- **Actual:** **500**, length 0, no content-type. Dev log: `SyntaxError: Expected property name…` and `Unexpected end of JSON input`, then `POST /api/cases 500`.
- **Evidence:** Both responses status 500, `len: 0`. PATCH `{bad` on `/api/cases/:id` is 400.
- **File:** `src/app/api/cases/route.ts:73` (no try/catch). PATCH wraps json at `src/app/api/cases/route.ts:140`.
- **Suggested fix:** Same try/catch as PATCH.

### BH-CASES-012 — Search treats `%` and `_` as LIKE wildcards

- **Severity:** low
- **Steps:** `GET /api/search?q=%25` and `GET /api/search?q=_`. SQL-ish `q` is not injectable.
- **Expected:** Literal match, or wildcards escaped.
- **Actual:** `q=%` and `q=_` returned the case list (including the stored XSS title) because the pattern is `%${q}%` with no escape. Cases page search is in-memory `includes()` and is not SQL.
- **Evidence:** `/api/search?q=%25` 200 with multiple cases. SQL payload returned `{ cases: [], runs: [], folders: [] }`.
- **File:** `src/app/api/search/route.ts:27`
- **Suggested fix:** Escape `%`, `_`, and `\` before `ilike`.

### BH-CASES-013 — CSV export returns stored markup and formula text as-is

- **Severity:** low
- **Steps:** Create a case whose title/steps/expected contain `<script>` / `=HYPERLINK("http://evil.example","click")`. `GET /api/import/csv` (the cases page opens this).
- **Expected:** Spreadsheet-safe cells (prefix `=`, `+`, `-`, `@`) and no raw active content beyond CSV text.
- **Actual:** `text/csv` includes `BUGHUNT-CASES-xss,"<img src=x onerror=alert(1)><script>alert(""BUGHUNT"")</script>",…`. Quotes are doubled, but a leading `=` is not neutralized, so Excel still treats formula cells as formulas. JSON APIs are not HTML XSS (see coverage).
- **Evidence:** `GET /api/import/csv` 200 `text/csv`; row starts with the unescaped script/img payload. Expected result was stored as `=HYPERLINK(...)` plus the same markup. UI text nodes would not execute the script.
- **File:** `src/lib/csv.ts:132` (escape only quotes comma/quote/newline); download `src/app/api/import/csv/route.ts:37`.
- **Suggested fix:** Prefix formula-like cells with `'`. Keep JSON responses as JSON (already safe).

---

## Not bugs

- Missing/empty/null title, wrong types, negative priority, 100k title, status/priority injection, bulk empty ids, 501 ids, missing folder, non-uuid case id: rejected.
- `role` / `workspaceId` / `id` on create and PATCH do not stick. Cross-project GET/PATCH/DELETE of a foreign id is 404.
- XSS payload is stored and returned as a JSON string (`Content-Type: application/json`). The cases page encodes it as `\u003cimg` / `\u003cscript`. Activity summaries such as `steps  → <script>alert(1)</script>` are text nodes in `case-history-panel.tsx`. A browser will not run that HTML from these responses.

```json
[
  {
    "id": "BH-CASES-001",
    "severity": "high",
    "title": "Deleting a case cascades away run results and notes",
    "steps": "Create a case, attach it to a run, mark the result failed with notes, DELETE /api/cases/:id, GET /api/runs/:id.",
    "expected": "409 or detached result that keeps status and notes.",
    "actual": "200 delete; run results array became empty (failed result and notes gone).",
    "evidence": "Run 434f400f-595a-4258-8857-15d81726e5f2 resultCount 1 status failed then resultCount 0.",
    "file": "src/db/schema.ts:282",
    "suggested_fix": "ON DELETE RESTRICT or SET NULL with a snapshot; 409 if run_results reference the case."
  },
  {
    "id": "BH-CASES-002",
    "severity": "high",
    "title": "Duplicate case key and bad assignee return 500 plus the SQL statement",
    "steps": "POST /api/cases twice with the same key, or with a nonexistent assigneeId UUID.",
    "expected": "409 for duplicate key and 400 for a bad assignee, with no query text.",
    "actual": "500 JSON body is Drizzle Failed query plus params (workspace id and user id). Unique check looks at err.message, but Postgres 23505 is on err.cause.",
    "evidence": "Duplicate response len 744 includes insert SQL and actor 35b1fc6b-91cd-4038-b22c-96bd2da6751f. Concurrent collide: one 201, one 500.",
    "file": "src/app/api/cases/route.ts:112",
    "suggested_fix": "Map cause.code 23505 to 409 and 23503 to 400. Never return err.message to the client."
  },
  {
    "id": "BH-CASES-003",
    "severity": "medium",
    "title": "Concurrent bulk tag add loses a tag while both calls succeed",
    "steps": "Parallel PATCH /api/cases tagMode add with tags alpha and beta on the same case.",
    "expected": "Both tags kept, or one request 409.",
    "actual": "Both 200; final tags were [base, alpha] and beta was dropped.",
    "evidence": "Response A tags [base, alpha], response B tags [base, beta], GET tags [base, alpha].",
    "file": "src/app/api/cases/route.ts:227",
    "suggested_fix": "Transaction plus row lock, or SQL array union. Do not read-modify-write tags outside a lock."
  },
  {
    "id": "BH-CASES-004",
    "severity": "medium",
    "title": "Non-UUID folderId on GET /api/cases is an empty 500",
    "steps": "GET /api/cases?folderId=not-a-uuid and GET with a SQL-ish folderId.",
    "expected": "400. Parameterized query (injection did not run).",
    "actual": "500 empty body. Postgres 22P02 invalid uuid at listCases.",
    "evidence": "Both calls status 500 len 0. Dev log cites src/app/api/cases/route.ts:54 and code 22P02.",
    "file": "src/app/api/cases/route.ts:52",
    "suggested_fix": "Validate folderId as UUID before querying; return 400."
  },
  {
    "id": "BH-CASES-005",
    "severity": "medium",
    "title": "Unbounded case text and tags, list ignores page and offset",
    "steps": "POST 100k steps and description. Bulk-replace a 100k tag. GET /api/cases?page=999999999&offset=-1&limit=1.",
    "expected": "Length caps and a paged list.",
    "actual": "201 and 200. List response 2269267 bytes. page, offset, and limit ignored.",
    "evidence": "bigsteps create stepsLen 100000. GET /api/cases len 2269267.",
    "file": "src/lib/queries.ts:243",
    "suggested_fix": "Max lengths on description, steps, expectedResult, and tags. Paginate listCases."
  },
  {
    "id": "BH-CASES-006",
    "severity": "medium",
    "title": "Bulk PATCH reports success when some ids are outside the workspace",
    "steps": "PATCH /api/cases with caseIds containing one local id and one id from another project, status blocked.",
    "expected": "400 and no write if any id is missing.",
    "actual": "200 updated 1. Foreign case stayed draft. Isolation held.",
    "evidence": "updated 1; foreign GET status draft.",
    "file": "src/app/api/cases/route.ts:180",
    "suggested_fix": "If existing.length !== unique caseIds length, return 400 and do not update."
  },
  {
    "id": "BH-CASES-007",
    "severity": "medium",
    "title": "Case activity silently drops history past 80 rows",
    "steps": "PATCH a case status 90 times, then GET /api/cases/:id/activity.",
    "expected": "All rows or a cursor and hasMore, including the created event.",
    "actual": "Exactly 80 activities. No created event. No hasMore.",
    "evidence": "count 80, keys [activities], has created false.",
    "file": "src/app/api/cases/[id]/activity/route.ts:52",
    "suggested_fix": "Add cursor pagination and hasMore. Do not silently omit the create row."
  },
  {
    "id": "BH-CASES-008",
    "severity": "medium",
    "title": "Whitespace and case-variant keys and titles are accepted",
    "steps": "POST whitespace title, key of three spaces, and keys that differ by case or a trailing space.",
    "expected": "400 after trim. One canonical key per workspace.",
    "actual": "201 for all. PATCH whitespace title is 400 because only the update schema trims.",
    "evidence": "201 title '   \\t  ' and key '   '. GOOD and trailing-space keys also 201.",
    "file": "src/app/api/cases/route.ts:15",
    "suggested_fix": "trim().min(1) on key and title. Unique index on lower(btrim(key))."
  },
  {
    "id": "BH-CASES-009",
    "severity": "low",
    "title": "No case status transition rules",
    "steps": "PATCH status deprecated, then ready, then draft. Repeat via bulk status.",
    "expected": "Illegal transitions rejected if a state machine exists.",
    "actual": "Any enum value is accepted, including deprecated to ready to draft.",
    "evidence": "Five status PATCHes on 4752cf46-caf0-41c9-882c-50bdeb89b673 all 200.",
    "file": "src/app/api/cases/[id]/route.ts:160",
    "suggested_fix": "Reject non-allowed edges such as deprecated to ready unless an explicit restore action is used."
  },
  {
    "id": "BH-CASES-010",
    "severity": "low",
    "title": "Unauthenticated case APIs redirect to HTML login instead of 401",
    "steps": "GET/POST/PATCH /api/cases and GET /api/cases/:id/activity with no cookie.",
    "expected": "401 JSON Unauthorized.",
    "actual": "307 to /login?callbackUrl=.... Handler 401 is unreachable.",
    "evidence": "Status 307 location /login?callbackUrl=http://localhost:4317/api/cases.",
    "file": "src/auth.config.ts:8",
    "suggested_fix": "Return JSON 401 for /api/* when there is no session, instead of redirecting to /login."
  },
  {
    "id": "BH-CASES-011",
    "severity": "low",
    "title": "POST /api/cases with invalid JSON is an empty 500",
    "steps": "POST /api/cases with body {not json or an empty body.",
    "expected": "400 Invalid JSON body, matching PATCH.",
    "actual": "500 length 0. SyntaxError in the server log.",
    "evidence": "Both calls status 500 len 0. PATCH invalid JSON is 400.",
    "file": "src/app/api/cases/route.ts:73",
    "suggested_fix": "Wrap request.json() in try/catch and return 400."
  },
  {
    "id": "BH-CASES-012",
    "severity": "low",
    "title": "Search query wildcards are not escaped",
    "steps": "GET /api/search?q=%25 and GET /api/search?q=_ . SQL-ish q returns no rows.",
    "expected": "Literal search or escaped LIKE metacharacters.",
    "actual": "% and _ match every case. SQL injection did not run.",
    "evidence": "q=%25 200 with the case list. SQL payload returned empty arrays.",
    "file": "src/app/api/search/route.ts:27",
    "suggested_fix": "Escape %, _, and backslash before ilike."
  },
  {
    "id": "BH-CASES-013",
    "severity": "low",
    "title": "CSV export returns stored HTML and formula text without neutralization",
    "steps": "Store script/img and =HYPERLINK in title, steps, and expectedResult. GET /api/import/csv.",
    "expected": "Formula-prefixed cells and no active spreadsheet content. JSON XSS is not an issue if UI escapes.",
    "actual": "text/csv includes the raw script/img payload. Leading = is not prefixed. JSON APIs and the cases page escape HTML.",
    "evidence": "CSV row starts BUGHUNT-CASES-xss,\"<img src=x onerror=alert(1)><script>alert(\"\"BUGHUNT\"\")</script>\". Cases HTML uses \\u003cscript.",
    "file": "src/lib/csv.ts:132",
    "suggested_fix": "Prefix formula-like cells with a quote. Keep returning JSON as application/json."
  }
]
```
