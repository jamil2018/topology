# BUGHUNT-RUNS — manual runs and result comments

Live probe of `http://127.0.0.1:4317` as `demo@topology.local` on 2026-09-16. Scope was `POST/GET/PATCH /api/runs`, `PATCH /api/runs/[id]`, `POST/GET /api/results/[id]/comments`, and the runs list / detail / new UI. No code was changed. The seeded demo run `39d8eee1-060e-4bdb-a232-fc3f1f025143` (`Local smoke — bootstrap`, `planned`) was not read-modified.

Fixture users for “viewer” and “user outside the workspace” were not created: the database has a single user (`35b1fc6b-91cd-4038-b22c-96bd2da6751f`), who is an admin of both projects. Those two assignment cases are therefore code-confirmed plus a live negative (unknown user hits the database, not a membership check), not a live success path.

## Coverage

| Attempt | Result |
| --- | --- |
| Create with omitted `caseIds` | **Bug.** Attached every ready case (51), not an empty run. |
| Create with `caseIds: []` | **Same bug.** 51 ready cases. Create response does not include results. |
| Create with `caseIds: null` | 400, as expected. |
| Unknown case id | 400 `One or more case ids are invalid`. |
| Non-UUID case id | 400. |
| Duplicate case ids `[A, A]` | 400, misleading “invalid” (the id exists). No unique `(run_id, case_id)`. Did not persist duplicates. |
| Case from project `test` (`8f861e9a-…`, case `6ff2e852-…`) alone or mixed with a local case | 400. Isolation held. |
| Explicit draft case | Allowed (1 result). The new-run UI also lets you select non-ready cases, so this matches the picker, not the empty-array “ready only” default. |
| Extra `status: "completed"` / `kind: "automation"` on create | Stripped. Run stayed `planned` / `manual`. |
| Name length 201 | 400. |
| Whitespace name `"   "` | **Bug.** 201, name stored as three spaces. UI disables Create when `!name.trim()`. |
| Unicode name / description | Stored and returned intact. |
| Description of 50,000 chars | **Bug.** Accepted, no max (comments cap at 4000). |
| Create assignee unknown UUID | **Bug.** Empty HTTP 500. |
| Create assignee `"viewer"` | 400 invalid UUID (create uses `safeParse`). |
| Invalid JSON / form body on create | Empty HTTP 500 (`request.json()` throw). |
| Complete a planned run whose only result is `untested` | **Bug.** 200, status `completed`, result still `untested`. Report page KPIs `executed: 0`, `untested: 1`, `passRate: null`. |
| Double-complete | Idempotent. `completedAt` stayed `2026-09-16T18:32:37.524Z`. Webhook not re-dispatched (code). Not a bug. |
| Start / abort / result status on a completed run | 409 immutable. |
| Start / complete / result status on an aborted run | 409 immutable. |
| Double-abort | 200, already aborted. Not a bug. |
| Assign / assign_result on completed and aborted runs | **Bug.** 200. Structure still editable after freeze. |
| Rename a completed run | No name field on PATCH. Body falls through to result schema and 400. Cannot edit name in any status. |
| Start twice | **Bug.** `startedAt` moved from `…18:34:01.673Z` to `…18:34:02.954Z`. |
| Result `passed` / `failed` / `blocked` / `skipped` with `notes: ""` or omitted | **Bug.** 200. No notes rule exists; UI placeholder says optional. `failed` still calls `openTriageForResult`. |
| Status aliases `pass` / `skip` | 400. Enum is `passed` / `skipped`. |
| Notes `null` | 400. |
| Notes 100,000 chars, unicode, RLO (`U+202E`) | Stored. No notes max. RLO is rendered in `whitespace-pre-wrap` (display spoof, not XSS). |
| Race: two clients `passed` and `failed` on run `4d9c2c0d-…` | **Bug.** Both 200. Final result `passed` / notes `passed`. No version or conflict. |
| Comment empty / whitespace / missing / number | 400. |
| Comment 4000 / 4001 | 201 / 400. Limit held. |
| Comment XSS string | Stored raw. Run page HTML escapes it (`&lt;script&gt;…onerror=alert(1)&gt;`). Not executed. |
| Comment unicode | Stored. |
| DELETE / PUT / PATCH comments | 405. No delete API. UI has no delete. Not a bug. |
| Comment on unknown result UUID | 404. |
| Comment / GET comments on `not-a-uuid` | Empty HTTP 500. |
| Unauthenticated comment POST | 307 to `/login`. Not stored (list count stayed 3). |
| Unauthenticated `GET /api/runs` | Redirects to login HTML. Not a data leak. |
| Comment on a completed result | Allowed. Matches the locked-run banner (“comments are still allowed”). |
| `GET /api/runs?page=2&limit=1&status=planned&kind=manual&q=BUGHUNT-RUNS` | **Bug.** Identical to unfiltered: 53 runs, kinds `manual`+`automation`, all statuses. |
| Runs list UI pagination | Works client-side: SSR `1–10 of 27`, 10 run links, Previous disabled, Next enabled. Automation names absent (page query uses `listRuns(..., "manual")`). |
| Runs list status filter | No status control. Search box matches name/id/status/environment in the client. Not exercised interactively (browser tab would not attach); filter logic is `filterAndSortRuns`. |

Leftover prefixed artifacts (not deleted): cases `BUGHUNT-RUNS-A`, `BUGHUNT-RUNS-DRAFT`, foreign `BUGHUNT-RUNS-FOREIGN`; runs including `BUGHUNT-RUNS empty-cases` (`5c631810-7565-4d4c-9d96-9bdeb01f5d01`) and `BUGHUNT-RUNS omit-cases` (`f36d59dc-86ed-4000-bc52-95e8d12b88a7`), each with 51 results; completed `BUGHUNT-RUNS base` (`fe3e621e-0603-49d5-8057-2c0e4f392d6a`).

## Highest-severity findings

### 1. High — empty or omitted `caseIds` attaches every ready case

`POST /api/runs` with `{"name":"BUGHUNT-RUNS omit-cases"}` and with `{"name":"BUGHUNT-RUNS empty-cases","caseIds":[]}` both returned 201. Follow-up GET showed **51 results**, status `planned`. Ready cases in the project were 50 before the probe case was added; 51 is every `ready` case. The draft probe case was not included. The 201 body is only `{ run }` — it does not list attached cases — so a caller cannot see the expansion without another fetch. Detail GET for either run was about 2 MB.

The new-run UI requires a selection (`start-run-workspace.tsx` blocks `selectedCount === 0`). The API does the opposite of an empty selection.

- Location: `src/app/api/runs/route.ts:62-68` (empty array loads all `ready` cases). Schema default `[]` at line 19.
- Suggested fix: treat omitted or empty `caseIds` as 400 (“select at least one case”). Do not invent a suite. If a legacy “all ready” mode is required, require an explicit flag such as `caseIds: "all-ready"` and return the attached ids in the 201 body.

### 2. High — complete is allowed with pending results, and the run becomes a report

`PATCH /api/runs/fe3e621e-0603-49d5-8057-2c0e4f392d6a` `{"action":"complete"}` on a `planned` run with one `untested` result returned 200. GET afterwards: `status: completed`, `completedAt: 2026-09-16T18:32:37.524Z`, result still `untested` with empty notes. `/reports/fe3e621e-…` rendered that run with KPIs `passed: 0, failed: 0, skipped: 0, blocked: 0, untested: 1, executed: 0, passRate: null`. The complete handler also dispatches `run.completed`.

The executor shows Complete whenever the run is not frozen, including `planned` with 0% progress. The confirm modal does not mention untested results.

- Location: `src/app/api/runs/[id]/route.ts:121-144` (no result-status gate). UI: `src/components/run-executor.tsx:276-287` and `687-695`.
- Suggested fix: reject complete (409) unless every result is terminal (`passed|failed|blocked|skipped`), or require an explicit `force: true`. Surface the untested count in the modal and disable Complete until that is acknowledged. Do not publish a 0-executed run as a completed report.

### 3. High — completed and aborted runs can still be assigned

After freeze, start / abort / result status correctly return 409. Assignment does not.

On completed `fe3e621e-…`:

- `{"action":"assign","assigneeId":"<demo>"}` → 200, status stayed `completed`.
- `{"action":"assign_result","resultId":"79599b68-…","assigneeId":"<demo>"}` → 200. GET showed result `assigneeId` set while run status stayed `completed`.

On aborted `32858198-2752-4474-94e2-0cad34eabd24`:

- `{"action":"assign","assigneeId":"<demo>"}` → 200, status stayed `aborted`, assignee set.

The run page banner says results and structure can no longer be edited. Status buttons and notes are disabled. Both assignee `<select>`s are rendered **without** `disabled` (SSR of `/runs/fe3e621e-…`).

- Location: assign / assign_result return before the freeze check, `src/app/api/runs/[id]/route.ts:147-177` vs `188-190`. UI: `src/components/run-executor.tsx:332-341` and `426-440` (`disabled={pending}` only).
- Suggested fix: call `isRunFrozen` at the start of every mutating branch except intentional post-complete comments/attachments. Disable both selects when `frozen`.

## Other confirmed bugs

### 4. Medium — assignee writes are not membership- or role-checked, and bad input is an empty 500

Create with `assigneeId: "00000000-0000-4000-8000-0000000000aa"` → 500, empty body. PATCH assign with that UUID, with `"viewer"`, or with the field omitted → 500, 0-byte body, no `content-type` (malformed case captured as `HTTP/1.1 500`).

`z.string().uuid().parse` throws instead of `safeParse`, so Next returns an empty 500. A valid UUID that is not a user row fails the `users.id` foreign key the same way. There is no lookup of `workspace_members` and no viewer-role reject. `assigneeId` references `users.id` only (`src/db/schema.ts:268-270` and `294-296`).

Live assignment of a viewer or an outsider could not be completed (single user). The missing check is why an unknown id 500s at the database instead of 400 “not a member of this project”.

- Location: `src/app/api/runs/[id]/route.ts:147-168`; create write `src/app/api/runs/route.ts:92`.
- Suggested fix: `safeParse` assignee ids and return 400. Resolve the user against `workspace_members` for the run’s workspace and reject unknown, outsider, and viewer (no `runs.edit`) with 400/403. Do not let Zod or the FK become a 500.

### 5. Medium — last-write-wins on the same result

Concurrent PATCH of run `4d9c2c0d-d3e9-4f6b-a8f4-634b34d8bf26` case `9a0afdc1-…`:

- client A `passed` / notes `passed` → 200
- client B `failed` / notes `failed` → 200
- GET: `in_progress`, result `passed`, notes `passed`

No `updatedAt` / version predicate. The loser is silently dropped. A fail that should open triage can also be overwritten by a pass with no conflict.

- Location: `src/app/api/runs/[id]/route.ts:192-206` (unconditional update by `runId` + `caseId`).
- Suggested fix: optimistic concurrency (`expectedStatus` or `executedAt`) and 409 when the row changed. Return the current result so both clients can retry.

### 6. Medium — fail / blocked / skipped do not require notes; notes are unbounded

| Request on `80985f9a-f698-499b-b51b-774a640cc389` | HTTP |
| --- | --- |
| `passed` / `failed` / `blocked` / `skipped` with `notes: ""` | 200, notes stored as `""` |
| `failed` with notes omitted | 200, notes default `""` |
| `failed` with 100,000-char notes | 200, length 100000 |
| unicode + RLO notes | 200, stored |

Comments enforce `trim` + 1..4000 (`src/app/api/results/[id]/comments/route.ts:11-13`). Result notes do not, including for `failed`, which opens triage via `openTriageForResult` (`src/app/api/runs/[id]/route.ts:221-223`). Description has the same hole (50,000 chars accepted on create).

- Location: `src/app/api/runs/[id]/route.ts:18-23` and `192-196`; create description `src/app/api/runs/route.ts:17`.
- Suggested fix: require non-empty notes for `failed`, `blocked`, and `skipped`. Cap notes and description (same 4000 as comments, or a documented higher cap). Strip bidi overrides or isolate the notes CSS.

### 7. Medium — non-UUID result ids 500

`POST /api/results/not-a-uuid/comments` and `GET` of the same path returned empty 500. A real unknown UUID returned 404. Postgres rejects the string when it is compared to `uuid`.

- Location: `src/app/api/results/[id]/comments/route.ts:15-21` (`eq(runResults.id, resultId)` with no UUID parse). Same class of throw as assign `parse` at `src/app/api/runs/[id]/route.ts:164`.
- Suggested fix: `z.string().uuid().safeParse(resultId)` before the query; 400 on failure.

### 8. Low — runs API ignores pagination and filters

`GET /api/runs` and `GET /api/runs?page=2&limit=1&status=planned&kind=manual&q=BUGHUNT-RUNS` returned the same 53 rows (25 manual, 28 other kinds, statuses `aborted|completed|in_progress|planned`).

The HTML list is better: `listRuns(workspaceId, "manual")` then client page size 10. SSR of `/runs` showed `1–10 of 27`, 10 links, Next enabled, Previous disabled. Search exists; there is no status dropdown.

- Location: `src/app/api/runs/route.ts:23-36` (no `searchParams`). `listRuns` has no limit (`src/lib/queries.ts:311-325`). UI page size `src/lib/run-list.ts:12`.
- Suggested fix: honor `page`, `limit`, `status`, `kind`, and `q` on the API, default `kind=manual` to match the hub, and cap page size.

### 9. Low — start resets `startedAt`; whitespace names are valid

`PATCH` `action: "start"` on `edf61111-4b7e-42ce-90bc-a4e63c9bd7a8` while already `in_progress` changed `startedAt` by about 1.3s. Name `"   "` was accepted (`728e4ca8-3127-494f-92c5-7ca2f202f9e5`) because `z.string().min(1)` does not trim.

- Location: `src/app/api/runs/[id]/route.ts:105-118`; `src/app/api/runs/route.ts:16`.
- Suggested fix: start only from `planned`, and set `startedAt` only when null. `name: z.string().trim().min(1).max(200)`.

### 10. Low — duplicate case ids are rejected with the wrong error, and there is no uniqueness guard

`caseIds: [9a0afdc1-…, 9a0afdc1-…]` → 400 `One or more case ids are invalid`. `inArray` returns one row, so `found.length !== caseIds.length` treats a duplicate as a missing id. `run_results` has only `run_results_pkey`, no unique `(run_id, case_id)`. The length check is the only guard.

- Location: `src/app/api/runs/route.ts:70-80`. Schema `src/db/schema.ts:277-299`.
- Suggested fix: reject duplicates with “duplicate case id” before the query, and add a unique index on `(run_id, case_id)`.

## Not bugs (attempted)

- Cross-project case ids rejected.
- Double-complete does not rewrite `completedAt`.
- Frozen result status, start, and abort return 409.
- Comment length, empty body, and unknown result UUID behave.
- XSS payload is HTML-escaped in the comment list (`whitespace-pre-wrap` text, not raw HTML).
- Unauthenticated comment POST does not insert a row.
- Delete comment is unsupported (405), and the UI does not offer it.

```json
[
  {
    "id": "BUGHUNT-RUNS-001",
    "severity": "high",
    "title": "Empty or omitted caseIds attaches every ready case",
    "evidence": "POST omit-cases and caseIds:[] both 201; GET attached 51 ready results. 201 body has no results.",
    "location": "src/app/api/runs/route.ts:62-68",
    "suggestedFix": "400 on empty selection; do not default to all ready cases. If that mode stays, require an explicit flag and return attached ids."
  },
  {
    "id": "BUGHUNT-RUNS-002",
    "severity": "high",
    "title": "Complete allowed with pending untested results",
    "evidence": "PATCH complete on planned run fe3e621e-0603-49d5-8057-2c0e4f392d6a returned 200. Result stayed untested. Report KPIs executed 0, untested 1, passRate null.",
    "location": "src/app/api/runs/[id]/route.ts:121-144",
    "suggestedFix": "409 unless every result is terminal, or require force. Warn in the complete modal. Do not treat 0-executed runs as completed reports."
  },
  {
    "id": "BUGHUNT-RUNS-003",
    "severity": "high",
    "title": "Completed and aborted runs still accept assignment",
    "evidence": "assign and assign_result returned 200 on completed fe3e621e-… and assign returned 200 on aborted 32858198-…. Status stayed frozen. Assignee selects are not disabled in SSR.",
    "location": "src/app/api/runs/[id]/route.ts:147-177",
    "suggestedFix": "Reject assign and assign_result with 409 when isRunFrozen. Disable both selects in the executor."
  },
  {
    "id": "BUGHUNT-RUNS-004",
    "severity": "medium",
    "title": "Assignee is not checked for membership or role; bad ids are empty 500s",
    "evidence": "Unknown UUID on create and PATCH assign returned empty 500. Malformed and missing assigneeId on PATCH returned empty 500. No workspace_members or viewer check. Live viewer/outsider success not proven (only one user exists).",
    "location": "src/app/api/runs/[id]/route.ts:147-168",
    "suggestedFix": "safeParse ids, 400 on invalid input, require a project member with runs.edit. Do not assign viewers or users outside the workspace."
  },
  {
    "id": "BUGHUNT-RUNS-005",
    "severity": "medium",
    "title": "Concurrent pass and fail both succeed; last write wins",
    "evidence": "Two PATCHes on run 4d9c2c0d-d3e9-4f6b-a8f4-634b34d8bf26 both 200 (passed and failed). Final status passed, notes passed.",
    "location": "src/app/api/runs/[id]/route.ts:192-206",
    "suggestedFix": "Optimistic concurrency with 409 on conflict."
  },
  {
    "id": "BUGHUNT-RUNS-006",
    "severity": "medium",
    "title": "Fail, blocked, and skipped allow empty notes; notes and description are unbounded",
    "evidence": "passed/failed/blocked/skipped with empty notes all 200. 100000-char notes stored. 50000-char description stored. Comments cap at 4000.",
    "location": "src/app/api/runs/[id]/route.ts:18-23",
    "suggestedFix": "Require notes for failed, blocked, and skipped. Cap notes and description."
  },
  {
    "id": "BUGHUNT-RUNS-007",
    "severity": "medium",
    "title": "Non-UUID result id on comments returns empty 500",
    "evidence": "POST and GET /api/results/not-a-uuid/comments returned empty 500. Unknown UUID returned 404.",
    "location": "src/app/api/results/[id]/comments/route.ts:15-21",
    "suggestedFix": "Validate the id as a UUID and return 400."
  },
  {
    "id": "BUGHUNT-RUNS-008",
    "severity": "low",
    "title": "Runs API ignores pagination and filters",
    "evidence": "GET /api/runs?page=2&limit=1&status=planned&kind=manual&q=BUGHUNT-RUNS matched the unfiltered list: 53 runs, both kinds, all statuses. UI page itself paginates 1-10 of 27 manual runs.",
    "location": "src/app/api/runs/route.ts:23-36",
    "suggestedFix": "Apply page, limit, status, kind, and q on the API. Default kind to manual."
  },
  {
    "id": "BUGHUNT-RUNS-009",
    "severity": "low",
    "title": "Start resets startedAt; whitespace-only names are accepted",
    "evidence": "Second start on edf61111-4b7e-42ce-90bc-a4e63c9bd7a8 moved startedAt from 18:34:01.673Z to 18:34:02.954Z. Name of three spaces was 201.",
    "location": "src/app/api/runs/[id]/route.ts:105-118",
    "suggestedFix": "Start only from planned and set startedAt once. Trim the name before min(1)."
  },
  {
    "id": "BUGHUNT-RUNS-010",
    "severity": "low",
    "title": "Duplicate case ids rejected as invalid; no unique constraint",
    "evidence": "caseIds [A, A] returned 400 One or more case ids are invalid. pg_indexes shows only run_results_pkey.",
    "location": "src/app/api/runs/route.ts:70-80",
    "suggestedFix": "Distinct duplicate error, plus unique (run_id, case_id)."
  }
]
```
