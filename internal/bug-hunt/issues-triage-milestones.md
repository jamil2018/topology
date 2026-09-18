# BUGHUNT-ISSUE / BUGHUNT-MS — issues, triage, milestones, flake

Live probe of `http://127.0.0.1:4317` as `demo@topology.local` on 2026-09-16. Scope was `src/app/api/issues`, `src/app/api/triage` plus `/triage`, `src/app/api/milestones` plus `/milestones`, and `src/app/api/flake` plus `/automation`. Issue provider is mock. No code was changed. No server restart, seed, or migration.

The demo user is an admin of both `Topology` (`3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf`) and `Test` (`8f861e9a-6cdc-4d2d-a1e7-52fdd7de8de7`). Cross-project writes below are live. A third user who is not a member of the victim project was not used; the code never checks the row’s workspace after the active-project gate.

## Coverage

| Attempt | Result |
| --- | --- |
| Create issue, unknown result UUID | 400 `Result not found`. |
| Create on untested / passed / skipped harness result `e03d984c-…` | 400 `Issues can only be filed from failed or blocked results`. |
| Create on blocked result | 200. Allowed by the failed-or-blocked rule. Not a bug. |
| Create on already-linked `f6a0daca-…` and second create on the same blocked result | **Bug.** Both 200. New `MOCK-3` and `MOCK-4`. |
| Link `remoteKey` empty | 400. |
| Link whitespace, `javascript:alert(1)`, `data:text/html,…`, `https://evil.example/phish`, 120,019-char key | **Bug.** All 200, stored, and rendered on `/runs/4d9c2c0d-…`. Linked onto a **passed** result. `javascript:` is not the href scheme (mock prefixes `https://`). |
| `mark_closed` / `refresh` / `ack_retest` / `create` with `x-topology-project-id` set to Test, or a bogus UUID | **Bug.** 200. Rows stay in Topology. Test’s retest queue stays empty. |
| `ack_retest` unknown UUID | **Bug.** 200 `{}`. `mark_closed` / `refresh` unknown UUID correctly 400. |
| Refresh after local close | **Bug.** `done` + `needsRetest: 1` becomes `open`; item leaves the retest queue. Refresh of `838d00c4-…` rewrote the title to `BUGHUNT-AGENT-filed-from-other-ws`. |
| Invalid JSON on issues / triage / milestones | **Bug.** Empty HTTP 500. Non-UUID ids are 400. |
| Triage illegal statuses (`cancelled`, `""`, `OPEN`, `null`, `1`, `closed`) | 400. |
| Triage PATCH of a Topology id while the active project is Test | 404 `Not found`. Item stayed in the default queue. Control held. Extra fields (`workspaceId`, `priority`, `notes`) ignored. |
| Snooze `9d8528d7-…` | Vanishes from GET queue. Restored with `status: "open"` for this probe. No wake time. |
| Milestone thresholds 0 | 200. Negative, 101, 80.5, `"95"` are 400. |
| Missing name / empty body | 400. PATCH with only `id` is 200 and touches `updatedAt`. |
| Duplicate name `BUGHUNT-MS-dup` | **Bug.** Both 200. No unique `(workspace_id, name)`. |
| DELETE `/api/milestones` and `/api/milestones/:id` on in-use `v1 launch gate` | 405 and HTML 404. No delete. |
| Folder from Test (`0413a5e7-…`) and unknown folder UUID | 400 `Folder not found`. |
| Milestone PATCH of Topology id from Test | 404. Control held. |
| Empty Auth folder milestone with default 95/80/0/0 | **Bug.** Badge Go, score 100, pass n/a, executed 100%. It became `?active=1`. |
| `v1 launch gate` vs TOP-1 / TOP-2 run history | **Bug.** UI and API say executed 0%, pass n/a, score 70. Latest timestamped TOP-1 result is `passed`. |
| Project-wide milestones vs all run results | API pass 43% / executed 8%. Timestamp-latest pass 61% / executed 64%. The 8/43 figures match “null `executed_at` sorts first”. |
| Flake, no history (Test project) | 200 `{flakeHints:[]}`. No 500. |
| Flake `limit=0`, `0.0`, `abc`, `NaN`, `Infinity`, `1e309` | **Bug.** Same as omitted limit (2 hints), not clamped to 1. `limit=1` and `limit=-1` return 1. |
| Division by zero | Not reachable. `detectFlakeSignal` divides only when the window has at least 4 samples. |
| Flake vs automation-only history | **Bug.** `AUTO-b::three` is score 60 only because a manual failure is in the window. Automation-only history has 3 samples and would not flag. `TOP-1` score 100 is entirely manual runs. |
| `/triage`, `/milestones`, `/automation`, run `4d9c2c0d-…` | HTTP 200. No console errors, no page errors. Milestones page shows the false Go and the 0% smoke gate. Automation page shows `38 THREADS` and `2 FLAKE`, not a blank error. |

DB counts (read-only): Topology has 284 results, 186 with `executed_at` null. Six `linked_issues` rows have `remote_key = 'MOCK-1'`. `linked_issues` and `milestones` indexes are only the primary key and `workspace_id`.

Leftover prefixed artifacts: case `BUGHUNT-ISSUE-1`, run `BUGHUNT-ISSUE-run` (`580dd46a-700d-46b1-bd59-eaabc0dadf62`), milestones `BUGHUNT-MS-empty`, `BUGHUNT-MS-dup` (two), `BUGHUNT-MS-vacuous` (`425f62ea-7797-4530-94ac-8540e837cd77`, currently the active gate). Linked keys include `javascript:alert(1)` and a 120,019-character key on result `7dc9df8b-…`.

## Highest-severity findings

### 1. High — release math treats never-executed placeholders as the latest result

`v1 launch gate` is scoped to folder Smoke (`85ff3414-…`), which contains `TOP-1` (P0) and `TOP-2` (P1).

`GET /api/milestones` and the milestones page both show: badge No-Go, score 70, pass n/a, executed 0%, P0 fails 0, blockers 5. Reasons: execution 0% below 80%, 5 open blockers.

Visible run history does not say that. `TOP-1`’s newest timestamped result is `passed` at `2026-09-13T10:04:36.505Z` (`6962466e-…`, manual run “Passed result”). It also has older untested rows with `executed_at` null. `TOP-2` has only null-`executed_at` untested rows. PostgreSQL `ORDER BY executed_at DESC` is `NULLS FIRST`, and the readiness query keeps the first row per case. Untested placeholders win.

Expected from those API results, ignoring null timestamps: executed 1/2 = 50%, pass rate 100% (1 pass / 0 fail), P0 fails 0, blockers still 5. Score would be `100*0.5 + 50*0.3 + 100*0.2 = 85`, still No-Go because 50% < 55% and blockers > 0. The page instead shows pass n/a and 0% executed. Score 70 is `100*0.5 + 0 + 20`: a null pass rate is counted as a perfect 100 in the score (`passComponent = passRate ?? 100` when nothing was executed).

Project-wide milestones (`BUGHUNT-MS-dup`, `bughunt-ms-811414`) show the same formula against the wrong latest: pass 43%, executed 8% (3 pass + 4 fail of 84 active cases). Recomputing from run APIs using the newest non-null `executed_at` gives pass 61% (33/54) and executed 64% (54/84). The 8/43 pair is exactly what you get if null timestamps sort first. 186 of 284 Topology results have a null `executed_at`, so this is the common case, not a tie.

- Location: `src/lib/queries.ts:391-396` (no `nulls last`, first row wins). Score lie: `packages/domain/src/readiness.ts:67-70` and `123-130`. Blocked results are also excluded from “executed” at lines 59-65 even though the comment says only untested/skipped should be excluded.
- Suggested fix: `ORDER BY executed_at DESC NULLS LAST`, and do not treat null `executed_at` as a newer outcome than a timestamped one. Use `created_at` as a fallback. Score a null pass rate as 0, not 100. Count `blocked` toward execution progress.

### 2. High — an empty suite is Go, and creating a milestone steals the active gate

`POST /api/milestones` `{"name":"BUGHUNT-MS-vacuous","folderId":"73a63df2-bf5b-4c3b-a1ee-d49db4bfde43"}` (Auth folder, zero cases) returned 200 with the defaults 95 / 80 / 0 / 0. Readiness: `status: "go"`, `score: 100`, `passRate: null`, `executedPct: 100`, reasons `Milestone gates are green — Go`.

`GET /api/milestones?active=1` on Topology now returns that milestone, not `v1 launch gate`. Every create inserts `status: "active"` and bumps `updated_at`. The hub and `?active=1` load the most recently updated active row. A new empty milestone replaces the launch gate with a false Go.

The milestones page already showed the same vacuous Go for `BUGHUNT-MS-empty` after thresholds were set to 0 (pass n/a, executed 100%, score 100, chip Go). Threshold 0 is accepted and disables the numeric gates; combined with the empty-suite special case it cannot fail.

Duplicate names are also accepted (`BUGHUNT-MS-dup` twice, both id-distinct, both active, identical wrong badges). `DELETE /api/milestones` is 405. `DELETE /api/milestones/2927ba22-…` is an HTML 404. In-use gates cannot be removed.

- Location: `packages/domain/src/readiness.ts:67-70` (`active.length === 0` forces executed 100% and score 100). Picker: `src/lib/queries.ts:339-346`. Insert always active: `src/app/api/milestones/route.ts:92-105`. No name unique: `src/db/schema.ts:354-372`.
- Suggested fix: zero cases is No-Go (“no cases in scope”), never Go. Allow only one active milestone, or require an explicit activate. Unique `(workspace_id, name)`. Add a delete or archive that does not rely on a missing route.

### 3. High — issue create, link, close, refresh, and ack ignore the active project

These calls were authorized against Test (`x-topology-project-id: 8f861e9a-…`) and mutated Topology rows:

- `mark_closed` on `cdc89334-70f3-492b-a213-9c8089ff572a` returned 200, `workspaceId` still `3f0ddc37-…`, `remoteStatus: "done"`, `needsRetest: 1`. Topology `GET /api/issues` then listed it on the retest queue. Test’s retest queue stayed `[]`.
- `refresh` on the same id, still from Test, returned 200 and set `remoteStatus` back to `open` while leaving `needsRetest: 1`. The retest queue dropped from 1 to 0. Sync undoes a local close and the item disappears from the queue that was supposed to surface it.
- `ack_retest` from Test cleared `needsRetest` on that Topology row.
- `create` from Test for Topology result `0107e76b-…` returned 200 issue `4e95dfaa-…` with `workspaceId` `3f0ddc37-…`.

A random project id also succeeds, because an unknown header falls back to the first accessible project, and the issue helpers still update by id alone. Refresh of pre-existing `838d00c4-…` (`remoteId: "mock-1"`, result `fa08c74b-…`) from Test rewrote `title` to `BUGHUNT-AGENT-filed-from-other-ws`. Six rows share `remote_key = 'MOCK-1'` because the mock counter lives in process memory and restarts at 1. `getIssue` then returns that one in-memory object, so sync copies another filing’s title and status onto every colliding row.

`ack_retest` of a random UUID returns 200 and `{ }` (no row, no 404).

Triage and milestone PATCH do filter `workspace_id`. Those IDOR attempts returned 404. Issues do not.

- Location: `src/app/api/issues/route.ts:93-147` (no workspace passed through). `src/lib/issues.ts:179-207`, `210-216`, `223-240`. Mock store: `packages/issue-providers/src/mock.ts:11-45`. Fallback project: `src/lib/project.ts:72-81`.
- Suggested fix: require `linked_issues.workspace_id` (and the result’s run workspace) to equal the active project, and 404 otherwise. Persist mock ids so keys do not reset. On refresh, do not overwrite a local `done` with a freshly invented `open`. `ack_retest` should 404 when no row returns.

### 4. Medium — one failure can be filed many times, and link accepts any result and any key

`POST` create on already-linked `f6a0daca-…` returned 200 `MOCK-3` (`e7450c05-…`). A second create on blocked `e03d984c-…` returned 200 `MOCK-4` (`742fde80-…`) after `MOCK-2` already pointed at it. There is no unique `(result_id)` index. Each open row counts as a release blocker, so duplicates move the gate.

`link` does not require failed or blocked. It stored these keys against passed result `7dc9df8b-…` on run `4d9c2c0d-…`:

- `"   "` → `remoteKey` three spaces, url `https://mock.topology.local/issues/   `
- `javascript:alert(1)` → url `https://mock.topology.local/issues/javascript:alert(1)`
- `data:text/html,<script>alert(1)</script>`
- `https://evil.example/phish`
- a 120,019-character key (`url_len` 120,054)

The run page returned 200 with no console error. The anchors’ `protocol` is `https:` (the mock host is prefixed, so this is not a live `javascript:` navigation). The link text is the raw key, including the 120k payload, interpolated with no `encodeURIComponent` and no max length. Empty key is the only reject (zod `min(1)`, no trim).

- Location: `src/lib/issues.ts:95-106` and `144-167`. Schema: `src/app/api/issues/route.ts:26-31`. URL: `packages/issue-providers/src/mock.ts:36-41`. Render: `src/components/run-executor.tsx:87-94`.
- Suggested fix: 409 if the result already has an open link. Apply the failed/blocked rule to link. Trim `remoteKey`, cap it (for example 200), reject whitespace and characters that are not a tracker key. Encode the path segment. Allowlist the stored URL scheme.

### 5. Medium — flake “automation history” includes manual runs; `limit=0` is ignored

`GET /api/flake` returns `TOP-1` score 100 and `AUTO-b::three` score 60. The automation page copy says flips “across recent automation history” and shows `2 FLAKE`.

`TOP-1`’s nine pass/fail rows are all `kind: manual`. `AUTO-b::three` automation-only history is three samples (fail, pass, fail), under the 4-sample minimum, so it would not be a flake. The score 60 appears only after a manual fail at `2026-09-13T07:31:09.720Z` is mixed in (`2 / 3` flips, balance `1/3`, `round(0.667*70 + 0.333*40) = 60`). That matches the API hint. The signal is stale relative to the surface it is shown on.

`?limit=0`, `?limit=0.0`, `?limit=abc`, `?limit=NaN`, `?limit=Infinity`, and `?limit=1e309` all return both hints. `Number("0") || 20` treats 0 as missing before the `Math.max(1, …)` clamp. `limit=1` and `limit=-1` correctly return one. Test project (no pass/fail history, 2083 cases) returned `[]` in about 200ms. No division-by-zero 500.

- Location: `src/lib/queries.ts:539-552` (no `runs.kind` filter). Clamp: `src/app/api/flake/route.ts:18-21`. Guarded divisor: `packages/domain/src/flake.ts:35-54`. UI claim: `src/components/automation-workspace.tsx:142-144`.
- Suggested fix: join `runs` and count only `kind = 'automation'` on the automation page. Parse `limit` with a finite-number check so `0` becomes 1, not 20.

### 6. Medium — invalid JSON is an empty 500

`POST /api/issues` with `{`, `PATCH /api/triage` with `{`, and `POST /api/milestones` with `not-json` each returned status 500 and a 0-byte body. `request.json()` is outside the action try/catch (issues) or unguarded (triage, milestones). Non-UUID ids on those routes are 400, so the hole is parse failures only.

- Location: `src/app/api/issues/route.ts:81`, `src/app/api/triage/route.ts:45`, `src/app/api/milestones/route.ts:72`.
- Suggested fix: catch `request.json()` and return 400 `{ error: "Invalid JSON body" }`.

## Also checked, not bugs

- Unauthenticated `GET /api/issues` redirects to `/login`. No issue payload.
- Triage status enum and cross-project id swap are rejected.
- Milestone numeric bounds (negative, >100, float, string) and foreign folders are rejected.
- Cross-project milestone PATCH is 404.
- Filing from a passed or unknown result is rejected. Blocked results are accepted on purpose.
- `/triage`, `/milestones`, and `/automation` render (200). Triage is not a blank 500 (13+ open rows, flake chip). Automation is not blank (38 threads, 2 flake). No Playwright console or page errors (`userDataDir` `/tmp/bughunt-issues/profile`).
- Snooze hides the row until something sets `open` again. There is no `snoozeUntil`. Product gap, not exercised as a 500.

```json
[
  {
    "id": "BUGHUNT-MS-001",
    "severity": "high",
    "title": "Milestone latest-result query treats null executed_at as newest, so Go/At-risk counts disagree with visible runs",
    "evidence": "v1 launch gate API and /milestones: score 70, pass n/a, executed 0%, P0 0, blockers 5. TOP-1 newest timestamped result is passed at 2026-09-13T10:04:36.505Z. Expected executed 50%, pass 100%, score 85. Project-wide API pass 43% / executed 8% matches NULLS FIRST; timestamp-latest is pass 61% / executed 64% (54/84). 186/284 results have null executed_at. Null pass rate is scored as 100.",
    "location": "src/lib/queries.ts:391-396",
    "suggestedFix": "ORDER BY executed_at DESC NULLS LAST and ignore null timestamps when a real result exists. Score a null pass rate as 0. Count blocked toward executed percent."
  },
  {
    "id": "BUGHUNT-MS-002",
    "severity": "high",
    "title": "Empty-suite milestone is Go at 100 and becomes the active release gate",
    "evidence": "POST BUGHUNT-MS-vacuous on empty Auth folder 73a63df2-… with default 95/80/0/0 returned badge Go, score 100, passRate null, executedPct 100. GET /api/milestones?active=1 then returned that milestone instead of v1 launch gate. Duplicate name BUGHUNT-MS-dup accepted twice. DELETE in-use gate is 405/HTML 404.",
    "location": "packages/domain/src/readiness.ts:67-70",
    "suggestedFix": "Zero cases is No-Go. Do not auto-activate every create. Unique names. Add archive/delete."
  },
  {
    "id": "BUGHUNT-ISSUE-001",
    "severity": "high",
    "title": "Issue create, link, close, refresh, and ack are not scoped to the active project",
    "evidence": "With x-topology-project-id Test, mark_closed on Topology issue cdc89334-… returned 200 done/needsRetest 1 and appeared on Topology retest queue only. refresh from Test set status back to open and dropped the queue to 0. create from Test on result 0107e76b-… wrote issue 4e95dfaa-… into workspace 3f0ddc37-…. ack unknown UUID returned 200 {}.",
    "location": "src/lib/issues.ts:179-240",
    "suggestedFix": "Filter every issue mutation by the active workspace id. 404 if no row. Do not let refresh invent an open status over a local close."
  },
  {
    "id": "BUGHUNT-ISSUE-002",
    "severity": "high",
    "title": "Mock issue ids reset in memory, and refresh copies one MOCK-1 onto every colliding row",
    "evidence": "Six linked_issues rows have remote_key MOCK-1. Refresh of 838d00c4-… (remoteId mock-1, result fa08c74b-…) from the Test project rewrote title to BUGHUNT-AGENT-filed-from-other-ws and status open. In-process creates during this probe continued at MOCK-2.",
    "location": "packages/issue-providers/src/mock.ts:11-45",
    "suggestedFix": "Persist the mock counter and look up issues by the stored remote id inside the project. Reject refresh when the remote object is a newly fabricated stand-in."
  },
  {
    "id": "BUGHUNT-ISSUE-003",
    "severity": "medium",
    "title": "Already-linked and double-file succeed; link accepts passed results and unsanitized keys",
    "evidence": "Create on already-linked f6a0daca-… returned MOCK-3. Second create on e03d984c-… returned MOCK-4. Link of whitespace, javascript:alert(1), data: URL, https://evil.example/phish, and a 120019-char key onto passed result 7dc9df8b-… all 200. Run page href protocol is https, not javascript. Empty key is 400.",
    "location": "src/lib/issues.ts:144-167",
    "suggestedFix": "409 if a result is already linked. Require failed or blocked on link. Trim, cap, and encode remoteKey. Allowlist http(s) URLs."
  },
  {
    "id": "BUGHUNT-ISSUE-004",
    "severity": "medium",
    "title": "Flake signal mixes manual runs into automation history; limit=0 returns the default page",
    "evidence": "API and automation chip show TOP-1 score 100 (all 9 samples manual) and AUTO-b::three score 60. Automation-only window for AUTO-b::three is 3 samples, below the flake minimum. limit=0, 0.0, abc, NaN, Infinity, 1e309 all returned 2 hints; limit=1 returned 1. Test project returned []. No division-by-zero 500.",
    "location": "src/lib/queries.ts:539-552",
    "suggestedFix": "Restrict automation flake to runs.kind = automation. Treat limit 0 as 1, not as a missing parameter."
  },
  {
    "id": "BUGHUNT-ISSUE-005",
    "severity": "medium",
    "title": "Invalid JSON on issues, triage, and milestones is an empty 500",
    "evidence": "POST /api/issues body '{', PATCH /api/triage body '{', POST /api/milestones body 'not-json' all returned 500 with an empty body. Non-UUID ids returned 400.",
    "location": "src/app/api/issues/route.ts:81",
    "suggestedFix": "Catch JSON parse errors and return 400."
  }
]
```
