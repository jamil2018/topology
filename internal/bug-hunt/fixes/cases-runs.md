# Cases, runs, and folders — integrity fixes

Date: 2026-09-17. No commit. `run_results.case_id` is still `ON DELETE CASCADE` in `src/db/schema.ts` (no migration). The API refuses the delete instead.

## Fixed

| Bug | Behavior now |
| --- | --- |
| BH-CASES-001 | `DELETE /api/cases/:id` locks the case row, and returns **409** `{ error: "Cannot delete a case that has run results" }` if any `run_results` row points at it. The delete does not run, so notes and result rows stay. A concurrent result insert waits on the case row (FK `KEY SHARE` vs `FOR UPDATE`) and cannot sneak in between the check and the delete. |
| BH-CASES-002 | Duplicate key maps `err.cause.code === "23505"` to **409** `{ error: "Case key already exists" }`. `err.message.includes("unique")` is not used. Unknown assignee is checked as a workspace member before insert. FK `23503` is **400** `{ error: "Invalid reference" }`. The client never gets `Failed query` or bind params. |
| BH-CASES-003 / B5 tags | Bulk `tagMode: "add"` locks the matched cases in id order, unions tags from the locked row (`unionTags`), and writes that array. Concurrent adds keep both tags. Replace mode is still last-write-wins. Deadlock / lock-not-available (`40P01` / `55P03`) is **409**, not a dropped tag and not SQL. |
| BH-CASES-004 / BH-CASES-011 | `GET /api/cases?folderId=not-a-uuid` is **400**. `POST /api/cases` with malformed JSON is **400** `{ error: "Invalid JSON body" }`. |
| BUGHUNT-RUNS-001 | Omitted or empty `caseIds` on `POST /api/runs` is **400** `{ error: "Select at least one case" }`. Ready cases are not attached. |
| BUGHUNT-RUNS-002 | `action: "complete"` locks the run and its results. If any status is not `passed` / `failed` / `blocked` / `skipped` (including `untested`), **409** `{ error: "Cannot complete a run while results are still untested" }`. Webhook is not dispatched. |
| BUGHUNT-RUNS-003 | `assign` and `assign_result` re-check `isRunFrozen` under a run row lock and return **409**, same helper as other mutations. Unassign (`null` / `""`) is also rejected when frozen. |
| BUGHUNT-RUNS-004 | Invalid assignee id is **400** (safeParse, not `.parse()`). A UUID that is not a member of this project is **400** `{ error: "Assignee is not a member of this project" }`. Viewers, and members whose effective actions omit `runs.edit` / `cases.edit`, are **403**. Create and assign both do this before the write. No SQL in the body. |
| BUGHUNT-RUNS-007 | `GET`/`POST /api/results/:id/comments` and result attachments reject a non-UUID id with **400** before the uuid column is queried. Comment JSON parse failures are **400**. |
| B3 folder cycle | `PATCH /api/folders/:id` locks every folder in the project ordered by id, then re-runs `wouldCreateFolderCycle` on that snapshot. Interleaved A↔B cannot both commit: the second waits, sees the first parent, and gets **400**. Self-parent is still a cycle. If the lock cannot be taken, **409** and no write. |
| B6 run complete race | The complete `UPDATE` is inside the same lock and only applies when status is not already `completed` or `aborted`. A parallel complete that loses the lock sees `completed`, returns the existing row, does not rewrite `completedAt`, and does not dispatch `run.completed` again. |

Assignee create/assign uses `cases.edit` for cases and `runs.edit` for runs and results. Clearing an assignee (`null` or `""`) is allowed on a mutable run.

## Not changed

- Schema `onDelete: "cascade"` on `run_results.case_id`. A raw SQL delete of a case still cascades. Prefer a later `ON DELETE RESTRICT` migration if out-of-band deletes must be blocked too.
- Result status last-write-wins (BUGHUNT-RUNS-005 / B5 notes). Not in the required set. A result write that does not take the run lock can still land after complete commits.
- Tag **replace** still overwrites the whole array. Status last-write-wins on case PATCH is unchanged.
- Folder create name uniqueness (B4). No unique index; parallel creates of the same name can still insert duplicates.
- Unbounded text, list pagination, activity 80-row cap, whitespace keys, status transitions, login redirects, search wildcards, CSV formula cells, start resetting `startedAt`, duplicate `caseIds` wording.
- Run executor assignee `<select>` is still enabled when the run is frozen. The API now returns 409. UI is outside these routes.
- Run and report pages that leak SQL for `not-a-uuid` were not edited.

## Tests

`npx vitest run --config vitest.packages.config.ts` on:

- `src/lib/pg-error.test.ts` (23505 is `cause.code`, not `message.includes("unique")`)
- `src/lib/assignee.test.ts`
- `src/lib/case-update.test.ts` (`unionTags`)
- `src/lib/run-immutability.test.ts` (`pendingResultCount`)
- `src/lib/folder-tree.test.ts` (reverse edge after the first parent write)

24 passed. `tsc --noEmit` and eslint on the edited routes were clean. `test:e2e` was not run.
