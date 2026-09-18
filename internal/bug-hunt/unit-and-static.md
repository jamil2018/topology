# Unit + static bug hunt

Date: 2026-09-17. Scope: `npm run test:unit`, `npm run test:ui`, static crash/misbehavior pass over `src/` and `packages/`, plus a code cross-check of `internal/*.md`. No live HTTP, no integration/e2e, no DB migrate/seed/push, no code changes.

Division in readiness (`packages/domain/src/readiness.ts`), flake (`packages/domain/src/flake.ts`), pulse, and report stats (`src/lib/report-stats.ts`) is guarded (`executed === 0` / `total === 0` / `Math.max(1, …)`). No confirmed divide-by-zero crash on the default call paths.

---

## Test command results

Both suites passed. Sandbox did not block them.

### `npm run test:unit`

`vitest run --config vitest.packages.config.ts`

| | |
| --- | --- |
| Result | **PASS** |
| Test files | 22 passed (22) |
| Tests | **117 passed (117)** |
| Duration | 1.90s |

No failing tests. No assertion messages.

### `npm run test:ui`

`vitest run --config vitest.ui.config.ts`

| | |
| --- | --- |
| Result | **PASS** |
| Test files | 8 passed (8) |
| Tests | **21 passed (21)** |
| Duration | 4.76s |

No failing tests. Non-failing stderr (does not fail the suite):

`A PressResponder was rendered without a pressable child. Either call the usePress hook, or wrap your DOM node with <Pressable> component.`

Seen from `src/components/run-executor.test.tsx` (complete/abort confirmation cases) and `src/components/cases-workspace.test.tsx` (delete confirm/deny). HeroUI overlay warning, not an assertion failure.

---

## Confirmed code defects

### 1. CI case-key truncation + unhandled unique violation (500s the ingest)

`src/lib/ci-ingest.ts:14-40` — `findOrCreateCaseForExternal`

- Sanitizes `externalKey` and **slices to 80 characters**, then prefixes `AUTO-` unless the key already starts with `AUTO-`.
- Check-then-insert against unique `(workspace_id, key)` (`src/db/schema.ts:245`). No `onConflictDoNothing` / retry.
- On collision, Postgres raises a unique violation. Callers do not catch it:
  - `src/app/api/ci/junit/route.ts` (POST has no try/catch around `upsertRunResultsFromNormalized`)
  - `src/app/api/ci/runs/[id]/shards/route.ts:70`
  - `src/app/api/ci/runs/[id]/complete/route.ts:40`
- `created` is also used unguarded (`return created.id` at line 40). Empty `.returning()` is a `TypeError`; a unique violation throws first.

**Repro:** two JUnit cases whose `classname::name` share the same first 80 sanitized characters (parameterized tests with a long class name; the `[0]` vs `[1]` suffix is past the cut). Second insert 500s the shard/junit/complete request and the run is not fully ingested. Parallel shards that miss `findFirst` for the same short key hit the same unique error.

### 2. `z.parse` on run assign throws a 500, not a 400

`src/app/api/runs/[id]/route.ts:147-168`

`action: "assign"` / `"assign_result"` uses throwing `z.string().uuid().parse(...)` instead of `safeParse`. Invalid or missing UUID (`assigneeId: "nope"`, missing `resultId`) throws `ZodError` before a JSON 400 can be returned. Next.js surfaces that as **500**.

The rest of the same handler uses `safeParse` for result updates (`line 180`).

### 3. Uncaught `request.json()` → 500 on malformed bodies

`request.json()` throws `SyntaxError` on empty or non-JSON bodies. Routes that do not wrap it return **500** instead of 400. Highest-traffic uncaught sites:

| File | Lines |
| --- | --- |
| `src/app/api/runs/[id]/route.ts` | 63 (before any action schema) |
| `src/app/api/agent/route.ts` | 150 (**outside** the try/catch that starts at 153) |
| `src/app/api/issues/route.ts` | 81 (outside the try at 84) |
| `src/app/api/runs/route.ts` | 53 |
| `src/app/api/cases/route.ts` | 73 (POST only; PATCH is wrapped) |
| `src/app/api/ci/junit/route.ts` | 45 |
| `src/app/api/ci/runs/route.ts` | 54 |
| `src/app/api/ci/runs/[id]/shards/route.ts` | 57 |
| `src/app/api/milestones/route.ts` | 72, 125 |
| `src/app/api/webhooks/route.ts` | 59, 137, 186 |
| `src/app/api/projects/route.ts` | 62, 136 |
| `src/app/api/workspace/route.ts` | 132, 228 |
| `src/app/api/roles/route.ts` | 106, 156 |
| `src/app/api/settings/route.ts` | 60 |
| `src/app/api/triage/route.ts` | 45 |
| `src/app/api/results/[id]/comments/route.ts` | 79 |
| `src/app/api/import/csv/route.ts` | 71 (JSON branch) |

Wrapped correctly (400): `src/app/api/views/route.ts:91`, `src/app/api/folders/route.ts:47`, `src/app/api/folders/[id]/route.ts:43`, `src/app/api/cases/[id]/route.ts:87`, cases PATCH.

**Repro:** `POST /api/agent` or `PATCH /api/runs/:id` with body `not-json` and a valid session/token. Response is 500, not `{ error: "Invalid JSON body" }`.

### 4. `durationMs` is an unbounded `z.number()` stored in a 32-bit integer

Schema: `src/db/schema.ts:290` `durationMs: integer("duration_ms")`.

Accepted as `z.number().optional().default(0)` with no `int()`, no finite check, no int4 range:

- `src/app/api/ci/runs/[id]/shards/route.ts:29`
- `src/app/api/ci/junit/route.ts:24`

A fractional value (`1.5`) or anything outside Postgres int4 (`-2147483648..2147483647`) makes the result insert throw (`22003` / `22P02`). That exception is not caught on the shard or junit routes, so ingest **500s** after the run row may already have been created (junit) or after the shard JSON is stored (shards). `Math.round` in `packages/domain/src/junit.ts:193` only protects the CLI XML path, not the HTTP body.

### 5. Unsafe `JSON.parse` on shard payloads and saved views

No try/catch. One bad string 500s the caller.

- `src/lib/ci-ingest.ts:218` — `loadShardResults` maps `JSON.parse(shard.payloadJson)`. Used by shard POST (`shards/route.ts:67`) and complete (`complete/route.ts:40`). A non-JSON `payload_json` row makes later shard posts and run complete fail forever (run stays non-completed).
- `src/lib/queries.ts:288` — `listSavedViews` does `JSON.parse(row.configJson)`. Called from `src/app/(app)/cases/page.tsx:30` and `src/app/(app)/runs/page.tsx`. One corrupt `saved_views.config_json` 500s those pages for that user. Write path (`views/route.ts` POST) stores `JSON.stringify` of a zod object, so this is a read-path crash, not a happy-path write bug.
- `src/app/api/views/route.ts:68` — same parse on GET; one bad row 500s the list.

`src/lib/saved-views.ts:26` and `:36` parse inside try/catch. CLI (`packages/cli/src/index.ts:78`) is wrapped. MCP client is not: `packages/mcp/src/client.ts:31` throws `SyntaxError` on an HTML/non-JSON error body before the `!res.ok` check, so the HTTP error string is lost. `packages/issue-providers/src/http.ts:30` (`readJson`) is the same pattern for provider responses.

### 6. Blocked failures never enter triage; agent failures neither

`src/lib/ci-ingest.ts:108-110` selects only `status === "failed"`. `openTriageForResult` (`ci-ingest.ts:123`) returns early unless status is `"failed"`.

- Manual PATCH does call triage, but only for failed: `src/app/api/runs/[id]/route.ts:221-222`. Blocked results never enqueue.
- Agent/MCP `record_result` (`src/app/api/agent/route.ts:239-290`) updates the result and returns. It never calls `openTriageForResult`. A failed result recorded by the agent is invisible to `/triage`.

Still matches the aggregations gap note that triage ingest is failure-status-specific, with the correction that **manual failed** results *are* enqueued now.

### 7. “Immutable” completed/aborted runs still accept comments, attachments, and issue mutations

`isRunFrozen` gates result/status writes (`src/app/api/runs/[id]/route.ts`, CI shards/complete/junit, agent `record_result`). These mutation routes do not check run status:

- `src/app/api/results/[id]/comments/route.ts:59` (POST)
- `src/app/api/results/[id]/attachments/route.ts:54` (POST)
- `src/app/api/issues/route.ts:67` (create/link/refresh/ack/mark_closed)

Copy in `src/lib/run-immutability.ts:13` says results and structure can no longer change. Comments, files, and new linked issues still land on a completed run.

### 8. Fire-and-forget webhook dispatch can reject unhandled

`src/lib/webhooks.ts:87-131` awaits `webhookEndpoints.findMany` **before** `Promise.allSettled`. Callers discard the promise:

- `src/app/api/runs/[id]/route.ts:141`
- `src/app/api/ci/runs/[id]/complete/route.ts:70`
- `src/app/api/ci/junit/route.ts:118`
- `src/lib/issues.ts:113`

A throw from the endpoint query (or from building deliveries) is an unhandled rejection. Delivery HTTP failures themselves are settled. The complete response still returns 200.

Non-null assertions that are redundant rather than crashing: `src/app/api/ci/junit/route.ts:95-116` `runId!` is only reached after `runId` is set from the body or from `created.id`. The real crash on a failed insert is the unique/integer errors above, not the `!`.

---

## Gap-analysis cross-check (code only)

Most `internal/*.md` product gaps are **stale** against this tree. Claims below are still true unless marked false.

### Still true (code defects or real gaps)

| Claim | Status | Where |
| --- | --- | --- |
| Triage enqueue is CI/manual **failed** only, not unlinked-only at write time | **True** (write) | `openTriageForFailures` writes every failed result; GET `getTriageQueue` (`queries.ts:456-458`) then hides linked ones |
| Blocked results are not triaged | **True** | `ci-ingest.ts:109`, `runs/[id]/route.ts:221` |
| Resolving triage does not require a linked issue | **True** | `src/app/api/triage/route.ts` PATCH status only |
| Comments / attachments ignore run freeze | **True** | reports exploration §2; routes above |
| No `/api/reports` resource (reports are queries over completed runs) | **True** | `listRunReports` / `getRunReport` in `queries.ts`; no `src/app/api/reports` |
| Flake threshold not user-configurable | **True** | `detectFlakeSignal` defaults `minSamples: 4`, `threshold: 40`; no settings column |
| Issue close → retest only on explicit refresh / `mark_closed`, not an inbound provider webhook | **True** | `src/lib/issues.ts` `refreshLinkedIssue` / `markIssueClosedLocally` |

### False now (do not re-file)

| Claim (source) | Current code |
| --- | --- |
| No milestone CRUD / no Go–No-Go labels (`aggregations-reporting-gap-analysis.md`) | `src/app/api/milestones/route.ts`; `readinessBadgeLabel` returns Go / At risk / No-Go (`packages/domain/src/readiness.ts:149`) |
| No file/link issue on `/triage` | `src/components/triage-workspace.tsx:64` `fileIssue` |
| Hub does not render `retestQueue` | `src/components/hub-pulse.tsx:497` |
| Webhooks absent | `src/lib/webhooks.ts`, `src/app/api/webhooks/route.ts`, dispatch on complete + issue create |
| Automation page is a redirect; `AutomationWorkspace` orphaned | `src/app/(app)/automation/page.tsx` renders `AutomationWorkspace` |
| Reports include all run statuses; no freeze; complete has no confirm; not workspace-scoped (`reports-run-completion-exploration.md`) | `listRunReports` filters `status = completed` (`queries.ts:573`); `isRunFrozen` on complete/start/result PATCH; run-executor confirm dialogs (covered by passing UI tests); queries take `workspaceId` |
| Manual failures never call triage ingest | False for **failed**; still true for **blocked** and for **agent** `record_result` |
| No workspaces / invites / roles / comments / attachments (`auth-collab-gap-analysis.md`) | Schema and APIs exist (`workspaces`, invites, `src/app/api/workspace/route.ts`, comments, attachments). That report is the stale one; `auth-membership-permissions-report.md` already says so |
| No `workspace_id` on domain tables (`multi-project-isolation-exploration.md`) | `cases.workspaceId` and the same on runs/folders/milestones/triage (`schema.ts`) |
| No case PATCH; KEY click is history-only (`case-edit-after-creation-exploration.md`, `linear-ux-gap-analysis.md`) | `src/app/api/cases/[id]/route.ts` PATCH; `CaseEditPanel` is mounted from `cases-workspace.tsx:1445`. KEY click still opens that panel via `setHistoryCase` (name is historical; the panel edits) |
| Folders are a flat list; page strips `parentId` (`cases-folders-exploration.md`) | `flattenFolderTree` / `buildFolderTree` used in `cases-workspace.tsx:186` and `folder-tree-pane.tsx` |
| `src/app/api/ci/runs/[id]/shards/route.ts` imports `openTriageForFailures` but does not call it | Import is gone. Shards do **not** call triage; complete and junit do. Dead-import claim is false; “shards don’t open triage until complete” is still true |

---

## Highest severity

1. **CI ingest 500** on truncated/colliding automation case keys (`ci-ingest.ts:14-40`) — realistic on long JUnit names and parallel shards.
2. **Assign 500** via throwing `z.parse` (`runs/[id]/route.ts:151-168`) plus the uncaught `request.json()` class (agent/issues/runs/CI).
3. **int4 `durationMs` 500** on shard/junit when the number is not a safe integer.
4. **Sticky JSON.parse 500** on shard complete and on `/cases` / `/runs` if a stored JSON column is not valid JSON.
5. **Triage miss** for blocked results and for agent-recorded failures.

```json
[
  {
    "id": "ci-case-key-truncation-500",
    "severity": "high",
    "title": "CI ingest 500s when truncated automation case keys collide",
    "area": "ci-ingest",
    "file": "src/lib/ci-ingest.ts:14",
    "repro_summary": "Submit two JUnit/shard results whose classname::name share the same first 80 sanitized characters. findOrCreateCaseForExternal inserts AUTO-<slice> twice; the unique (workspace_id, key) violation is uncaught and junit/shards/complete returns 500."
  },
  {
    "id": "run-assign-zod-parse-500",
    "severity": "high",
    "title": "PATCH run assign throws ZodError (500) instead of 400",
    "area": "runs",
    "file": "src/app/api/runs/[id]/route.ts:151",
    "repro_summary": "PATCH /api/runs/:id with {action:\"assign\", assigneeId:\"not-a-uuid\"} or {action:\"assign_result\"} missing resultId. z.string().uuid().parse throws; response is 500."
  },
  {
    "id": "uncaught-request-json-500",
    "severity": "high",
    "title": "Malformed JSON bodies 500 on agent, issues, runs, CI, and most other POST/PATCH routes",
    "area": "api",
    "file": "src/app/api/agent/route.ts:150",
    "repro_summary": "POST /api/agent (or PATCH /api/runs/:id, POST /api/ci/junit, POST /api/issues) with a non-JSON body. request.json() throws outside try/catch, so the client gets 500 instead of 400."
  },
  {
    "id": "duration-ms-int4-overflow",
    "severity": "medium",
    "title": "Unbounded durationMs written to integer column 500s CI ingest",
    "area": "ci-ingest",
    "file": "src/app/api/ci/runs/[id]/shards/route.ts:29",
    "repro_summary": "POST a shard or junit body with durationMs: 1.5 or 9999999999999. Zod accepts z.number(); Postgres integer insert throws and the route does not catch it."
  },
  {
    "id": "unsafe-json-parse-shards-views",
    "severity": "medium",
    "title": "JSON.parse on shard payloads and saved views crashes complete and cases/runs pages",
    "area": "persistence",
    "file": "src/lib/ci-ingest.ts:218",
    "repro_summary": "A run_shards.payload_json or saved_views.config_json value that is not valid JSON makes loadShardResults / listSavedViews throw. Shard complete stays 500; /cases and /runs 500 for that user."
  },
  {
    "id": "triage-skips-blocked-and-agent",
    "severity": "medium",
    "title": "Blocked results and agent-recorded failures never enter the triage queue",
    "area": "triage",
    "file": "src/lib/ci-ingest.ts:109",
    "repro_summary": "Record a blocked result on a manual run, or POST /api/agent action record_result with status failed. openTriageForFailures/openTriageForResult only handle failed, and the agent route never calls them, so /triage stays empty."
  },
  {
    "id": "frozen-run-side-mutations",
    "severity": "medium",
    "title": "Completed runs still accept comments, attachments, and issue actions",
    "area": "runs",
    "file": "src/app/api/results/[id]/comments/route.ts:59",
    "repro_summary": "Complete a run, then POST /api/results/:id/comments, POST /api/results/:id/attachments, or POST /api/issues create. isRunFrozen is not checked; the write succeeds."
  },
  {
    "id": "webhook-unhandled-rejection",
    "severity": "low",
    "title": "void dispatchWebhook rejects unhandled if endpoint lookup throws",
    "area": "webhooks",
    "file": "src/lib/webhooks.ts:99",
    "repro_summary": "Complete a run while webhookEndpoints.findMany throws. Callers use void dispatchWebhook without catch; the HTTP response can still be 200 and the rejection is unhandled."
  }
]
```
