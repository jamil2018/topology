# Test Reports & run completion — codebase exploration

Date: 2026-09-13. Repo: `/Users/jamil/Personal Projects/topology` (branch context: `cursor/views-beside-filters-bd5a`).

---

## Verdict

Reports are **views over runs** (no separate `reports` table or REST resource). List/detail are SSR pages backed by `listRunReports` / `getRunReport`. They currently include **all run statuses** (including planned / in-progress). Completing a run is a status flip (`completed` + `completedAt`); **there is no server-side freeze**. The UI Complete button fires immediately with **no confirmation dialog**. Runs/reports are **not workspace-scoped** (global DB rows).

---

## 1. How Test Reports work

### Model

- **1:1 with runs** — a “report” is aggregated run + `run_results` data, not a persisted entity.
- Pure aggregation helpers live in `src/lib/report-stats.ts` (KPIs, suite breakdown, timeline, failure rows, duration).

### Queries (no `/api/reports`)

| Function | File | Behavior |
| --- | --- | --- |
| `listRunReports()` | `src/lib/queries.ts` | Last 100 runs by `updatedAt` — **no status filter**. Aggregates result counts per run. |
| `getRunReport(runId)` | `src/lib/queries.ts` | Full run + results (+ case/folder/issues), flake hints, KPIs, suite/timeline/failures, peer trend from `listRunReports()`. |

### UI pages / components

| Path | Role |
| --- | --- |
| `src/app/reports/page.tsx` | Auth-gated list; calls `listRunReports()`. |
| `src/app/reports/[id]/page.tsx` | Auth-gated detail; `getRunReport(id)` or 404. |
| `src/app/reports/loading.tsx`, `[id]/loading.tsx`, `error.tsx` | Loading/error shells. |
| `src/components/reports-workspace.tsx` | List UI (“Test Reports”); search + kind filter; empty copy says reports for **completed or in-progress**. |
| `src/components/report-detail.tsx` | Detail KPIs/charts/failures. |
| `src/components/report-charts.tsx` | Donut, suite bars, timeline, peer trend. |
| `src/components/hub-shell.tsx` | Nav link `/reports`. |
| `src/components/command-palette.tsx` | Reports command. |
| `src/components/run-executor.tsx` | “View report” → `/reports/${run.id}` even while incomplete. |
| `src/components/hub-pulse.tsx` | Link to `/reports`. |

### Generation

There is **no report-generation API**. “Generation” = complete/ingest a run, then open `/reports/[runId]`. CI complete / JUnit ingest set `status: completed` and fire `run.completed` webhooks; they do not write a report row.

---

## 2. Run status & completion

### Schema fields (`runs`)

From `src/db/schema.ts`:

```ts
runStatusEnum: "planned" | "in_progress" | "completed" | "aborted"
status: default "planned"
kind: "manual" | "automation"
startedAt, completedAt
// also: name, description, environment, source, externalId,
// commitSha, branch, shardIndex, shardTotal, shardsReceived,
// createdById, assigneeId, createdAt, updatedAt
```

`aborted` is in the enum but **unused** in app mutation paths searched.

Result statuses (`run_results.status`): `untested` | `passed` | `failed` | `blocked` | `skipped`.

### Status transitions (current)

| Path | Transition |
| --- | --- |
| `POST /api/runs` | create → `planned` |
| `PATCH /api/runs/[id]` `action: "start"` | → `in_progress` + `startedAt` |
| `PATCH /api/runs/[id]` result update (no action) | updates result; **forces run → `in_progress`** (even if previously completed) |
| `PATCH /api/runs/[id]` `action: "complete"` | → `completed` + `completedAt`; webhook |
| `POST /api/ci/runs` | create → `in_progress` |
| `POST /api/ci/runs/[id]/shards` | upsert results; status → `in_progress` (**no completed guard**) |
| `POST /api/ci/runs/[id]/complete` | merge shards → `completed`; triage + webhook |
| `POST /api/ci/junit` | create or attach `runId`, upsert results → **always** `completed` |
| Agent `create_run` / `record_result` | planned create; result update with **no status/immutability check** |

### Mutation surfaces that edit run results / structure

| File | Mutations |
| --- | --- |
| `src/app/api/runs/route.ts` | Create run + insert untested results |
| `src/app/api/runs/[id]/route.ts` | start / complete / assign / assign_result / update result+notes |
| `src/app/api/ci/runs/route.ts` | Create automation run |
| `src/app/api/ci/runs/[id]/shards/route.ts` | Shard ingest + result upsert |
| `src/app/api/ci/runs/[id]/complete/route.ts` | Complete + merge |
| `src/app/api/ci/junit/route.ts` | One-shot ingest + complete |
| `src/app/api/agent/route.ts` | `create_run`, `record_result` |
| `src/app/api/results/[id]/comments/route.ts` | Add comments (no run-status check) |
| `src/app/api/results/[id]/attachments/route.ts` | Upload attachments (no run-status check) |
| `src/app/api/issues/route.ts` | Link/create issues on results (no run-status check) |
| `packages/cli/src/index.ts` | `runs create` / `submit-thread` / `complete` / `junit submit` |

UI: `src/components/run-executor.tsx` — Start / Complete / status buttons / notes / comments / attachments / assign. Complete button hidden when `status === "completed"`, but **result editing controls stay enabled** after complete (only gated by `pending`).

---

## 3. Immutability / freeze for completed runs

**None found.** No helpers named freeze/immutable; no `where status != completed` guards on write paths.

Notable hole: after complete, a manual result PATCH still runs:

```ts
.update(runs).set({ status: "in_progress", startedAt: new Date(), ... })
```

So a completed run can be **reopened** by editing any result. CI shard/JUnit can rewrite results on an already-completed `runId`.

Comments/attachments/issues remain writable after complete (may be intentional for collaboration — product decision).

---

## 4. Workspace / project scoping

- Auth tenancy: single default workspace (`slug: "default"`) via `src/lib/workspace.ts`.
- `workspace_id` exists on `workspaces` membership/invites and (recently) `saved_views` — **not** on `runs`, `run_results`, cases, folders, etc.
- `listRunReports` / `listRuns` / CI APIs read the entire `runs` table.
- Membership is used for write role on comments/attachments/settings, not for filtering runs/reports by tenant.

See also: `internal/multi-project-isolation-exploration.md`.

---

## 5. Existing tests

| File | Relevance |
| --- | --- |
| `src/lib/report-stats.test.ts` | Unit tests for report aggregations (not list filters / completion). |
| `src/components/skeletons.test.tsx` | Reports loading skeleton a11y. |
| `src/lib/run-list.test.ts` | Client filter/sort of run list statuses (not immutability). |
| `tests/integration/ci-ingest.integration.test.ts` | JUnit submit + sharded complete → `status === "completed"`. **Does not** assert reject-after-complete. |
| `packages/domain/src/domain.test.ts` | Pulse counts with completed/inProgress (unrelated to reports freeze). |
| `e2e/release-gate.spec.ts` | Creates a run; does not assert Complete confirm or report-only-completed. |

**Missing tests (gaps):** completed-only report list; 409/403 on mutate-after-complete; UI confirm before complete; reopen-via-result-edit regression.

---

## Gaps vs requirements

| Requirement | Current behavior | Gap |
| --- | --- | --- |
| Reports only include completed runs | `listRunReports` returns all statuses; empty-state copy advertises in-progress; detail works for any run id; trend peers include non-completed | **Yes** — filter list (and ideally detail/trend) to `status = 'completed'` |
| Completed runs immutable server-side | All write APIs accept updates; result PATCH can set status back to `in_progress` | **Yes** — need shared guard + apply on runs PATCH, CI shards/junit, agent `record_result`; decide policy for comments/attachments/issues |
| UI warn before completing a run | Complete → immediate `patch({ action: "complete" })` | **Yes** — no confirm; only folder delete uses HeroUI `Modal` confirmation pattern (`cases-workspace.tsx`) |

---

## Confirmation dialogs for complete

**None.** Grep for `confirm` / `AlertDialog` / `window.confirm` around runs: only password confirm in settings and folder delete/create modals in cases. Run Complete has no modal.

Reusable pattern to copy: `Modal.Root` delete confirmation in `src/components/cases-workspace.tsx`.

---

## Suggested files to change

### Reports = completed only

1. `src/lib/queries.ts` — `listRunReports`: `where eq(runs.status, "completed")` (and optionally same for trend peers inside `getRunReport`).
2. `src/app/reports/[id]/page.tsx` or `getRunReport` — 404 (or soft message) if run not completed.
3. `src/components/reports-workspace.tsx` — fix empty-state copy; optional client filter redundant if query filters.
4. `src/components/run-executor.tsx` — hide/disable “View report” until completed (optional UX).
5. New: `src/lib/queries` or report-list unit/integration test asserting non-completed excluded.

### Server-side immutability

1. New helper e.g. `src/lib/run-guards.ts` — `assertRunMutable(run)` → 409 if `completed` (and maybe `aborted`).
2. `src/app/api/runs/[id]/route.ts` — guard all mutating branches except read-only GET; **do not** force `in_progress` on completed; optionally allow `complete` only from non-completed.
3. `src/app/api/ci/runs/[id]/shards/route.ts`, `.../complete/route.ts`, `src/app/api/ci/junit/route.ts` — reject if already completed (or make complete idempotent but reject result rewrites).
4. `src/app/api/agent/route.ts` — guard `record_result`.
5. Policy choice: comments/attachments/issues — freeze or allow post-complete annotation.
6. `src/components/run-executor.tsx` — disable result/status/notes/assign edits when completed (UI mirror).
7. Tests: extend `tests/integration/ci-ingest.integration.test.ts` + new runs PATCH unit/integration tests.

### Complete confirmation UI

1. `src/components/run-executor.tsx` — HeroUI Modal (same pattern as folder delete) before `action: "complete"`.
2. Optional UI test if the repo adds component tests for executor.

### Out of scope unless multi-tenant lands

- Adding `workspace_id` to `runs` / filtering reports by workspace (see multi-project exploration).

---

## Key file index (absolute paths)

### Schema / DB
- `/Users/jamil/Personal Projects/topology/src/db/schema.ts` — `runStatusEnum`, `runs`, `runResults`
- `/Users/jamil/Personal Projects/topology/drizzle/0003_auth_collab_ops.sql` — assignee/comments/attachments (not status enum migration; base schema via drizzle-kit/push)

### Reports
- `/Users/jamil/Personal Projects/topology/src/lib/queries.ts` — `listRunReports`, `getRunReport`, `listRuns`
- `/Users/jamil/Personal Projects/topology/src/lib/report-stats.ts` — pure aggregations
- `/Users/jamil/Personal Projects/topology/src/lib/report-stats.test.ts`
- `/Users/jamil/Personal Projects/topology/src/app/reports/page.tsx`
- `/Users/jamil/Personal Projects/topology/src/app/reports/[id]/page.tsx`
- `/Users/jamil/Personal Projects/topology/src/components/reports-workspace.tsx`
- `/Users/jamil/Personal Projects/topology/src/components/report-detail.tsx`
- `/Users/jamil/Personal Projects/topology/src/components/report-charts.tsx`

### Run completion / mutations
- `/Users/jamil/Personal Projects/topology/src/app/api/runs/route.ts`
- `/Users/jamil/Personal Projects/topology/src/app/api/runs/[id]/route.ts`
- `/Users/jamil/Personal Projects/topology/src/app/api/ci/runs/route.ts`
- `/Users/jamil/Personal Projects/topology/src/app/api/ci/runs/[id]/shards/route.ts`
- `/Users/jamil/Personal Projects/topology/src/app/api/ci/runs/[id]/complete/route.ts`
- `/Users/jamil/Personal Projects/topology/src/app/api/ci/junit/route.ts`
- `/Users/jamil/Personal Projects/topology/src/app/api/agent/route.ts`
- `/Users/jamil/Personal Projects/topology/src/components/run-executor.tsx`
- `/Users/jamil/Personal Projects/topology/src/lib/webhooks.ts` — `buildRunCompletedPayload` / `run.completed`
- `/Users/jamil/Personal Projects/topology/packages/cli/src/index.ts`

### Workspace
- `/Users/jamil/Personal Projects/topology/src/lib/workspace.ts`
- `/Users/jamil/Personal Projects/topology/internal/multi-project-isolation-exploration.md`

### Tests
- `/Users/jamil/Personal Projects/topology/tests/integration/ci-ingest.integration.test.ts`
- `/Users/jamil/Personal Projects/topology/src/lib/run-list.test.ts`
- `/Users/jamil/Personal Projects/topology/e2e/release-gate.spec.ts`
