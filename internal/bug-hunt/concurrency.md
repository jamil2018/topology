# Concurrency / idempotency bug hunt

Live target: `http://127.0.0.1:4317`, demo user, project `3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf`. Entities prefixed `BUGHUNT-RACE-`. Bursts were 8–10 concurrent requests. Confirmed in Postgres `127.0.0.1:54329/topology`.

## Highest severity

1. **Unique violations become empty HTTP 500s, and the server log prints SQL, bind params, constraint name, and a stack.** Role create, project create, CI shard ingest, and JUnit ingest. Drizzle wraps Postgres `23505` as `Failed query: …` so `message.includes("unique")` misses it. Roles then `throw err`. CI paths do not catch at all, and the run row is already inserted.
2. **Check-then-act with no transaction or row lock.** Parallel folder parent swaps create a real cycle (both 200). Parallel same-name folder creates insert 10 duplicates. Tag-add and case-status updates last-write-win and write a false activity log.
3. **Run complete is not idempotent under concurrency.** Eight parallel `action: complete` calls all returned 200 with eight different `completedAt` values, so each passed the “already completed” check and each called `dispatchWebhook`.

Case-key POSTs did **not** duplicate: 1×201 + 9×409 `{"error":"Case key already exists"}`. That path is the exception, not the rule.

## Coverage

| Burst | n | Result |
| --- | --- | --- |
| `POST /api/cases` same key `BUGHUNT-RACE-DUP-mu4gdmqo` | 10 | 1×201, 9×409. One row. |
| `PATCH /api/cases/:id` mixed statuses | 10 | 10×200, different statuses in responses. Final `ready`. Activity all `from_value=draft`. |
| `PATCH /api/cases` `tagMode=add` ten distinct tags | 10 | 10×200. Stored tags: `seed`, `bughunt-race-tag-1` only. |
| `POST /api/folders` same name | 10 | 10×201. DB count 10. |
| Cross-parent `PATCH /api/folders/:id` | 2 | Both 200. Cycle persisted (attempt 0). |
| `PATCH /api/runs/:id` result statuses | 10 | 10×200, each response a different status/notes. Final `passed` / `note-0`. |
| `PATCH /api/runs/:id` `action=complete` | 8 | 8×200, eight distinct `completedAt` timestamps. |
| `DELETE /api/cases/:id` and `DELETE /api/folders/:id` | 2+2 | All 200. Loser body is `{}`. |
| `POST /api/roles` same name | 8 | 1×201, 7×500 empty body. |
| `POST /api/projects` same slug | 6 | 1×201, 5×500 empty body. One workspace row. |
| `POST /api/workspace` same invite email | 8 | 8×201. DB count 8. |
| `POST /api/ci/runs/:id/shards` same `shardIndex=1` | 8 | 1×200, 7×500. DB: **7** rows at index 1. `shards_received=5`, `shard_total=4`. |
| `POST /api/ci/junit` same `externalKey` | 8 | 2×200, 6×500. **8 runs** created; 6 stuck `in_progress`. One case row. |

Malformed JSON `{` and non-JSON `not-json` (authenticated; CI routes with the local demo bearer). One of each payload. 40 of 76 responses were **500 with a 0-byte body**.

## Bugs

### B1. Postgres unique violation surfaces as HTTP 500; log leaks SQL and stack (high)

`POST /api/roles` for existing name `BUGHUNT-RACE-ROLE-mu4gdnk4` returned:

- Status: `500 Internal Server Error`
- Body length: **0** (quoted body is empty: ``)

Dev server log for that request:

```
⨯ Error: Failed query: insert into "workspace_roles" ("id", "workspace_id", "name", "description", "actions", "is_system", "system_key", "archived_at", "created_at", "updated_at") values (default, $1, $2, $3, $4, $5, $6, default, default, default) returning "id", "workspace_id", "name", "description", "actions", "is_system", "system_key", "archived_at", "created_at", "updated_at"
params: 3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf,BUGHUNT-RACE-ROLE-mu4gdnk4,replay,{"cases.view"},false,
    at async POST (src/app/api/roles/route.ts:118:23)
  [cause]: Error [PostgresError]: duplicate key value violates unique constraint "workspace_roles_workspace_id_name_key"
    code: '23505',
    detail: 'Key (workspace_id, name)=(3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf, BUGHUNT-RACE-ROLE-mu4gdnk4) already exists.',
    table_name: 'workspace_roles',
    constraint_name: 'workspace_roles_workspace_id_name_key',
    file: 'nbtinsert.c',
    line: '666',
    routine: '_bt_check_unique'
```

Missing check is on `err.cause`, not `err.message`. Drizzle’s message is `Failed query: …`, so the unique branch is skipped and the error is rethrown:

```130:138:src/app/api/roles/route.ts
  } catch (err) {
    const message = err instanceof Error ? err.message : "Create failed";
    if (message.includes("unique") || message.includes("duplicate")) {
      return NextResponse.json(
        { error: "A role with that name already exists" },
        { status: 409 },
      );
    }
    throw err;
  }
```

Same class:

- `createProject` has no catch. Parallel same slug: 1×201, 5×500 empty. Insert is outside a transaction with the membership write (`src/lib/project.ts:274-299`).
- `findOrCreateCaseForExternal` check-then-insert, no catch (`src/lib/ci-ingest.ts:19-40`). JUnit unique log (also 500, empty HTTP body):

```
⨯ Error: Failed query: insert into "cases" ...
params: 3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf,AUTO-BUGHUNT-RACE-JUNIT-mu4gdnun,bughunt race junit,...
    at async findOrCreateCaseForExternal (src/lib/ci-ingest.ts:24:21)
    at async upsertRunResultsFromNormalized (src/lib/ci-ingest.ts:62:20)
    at async POST (src/app/api/ci/junit/route.ts:94:3)
  [cause]: Error [PostgresError]: duplicate key value violates unique constraint "cases_workspace_id_key_unique"
    detail: 'Key (workspace_id, key)=(3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf, AUTO-BUGHUNT-RACE-JUNIT-mu4gdnun) already exists.',
```

Contrast: `POST /api/cases` same key was handled (`src/app/api/cases/route.ts:112-119`) and returned 409, not a stack.

### B2. JUnit race leaves partial runs (high)

`src/app/api/ci/junit/route.ts:71-109` inserts the run, then calls `upsertRunResultsFromNormalized`, then sets `completed`. Unique failure at case insert aborts the handler after the run commit. DB: 8 runs named `BUGHUNT-RACE junit BUGHUNT-RACE-JUNIT-mu4gdnun`, **6 still `in_progress`**, 2 `completed`, 1 case.

### B3. Folder cycle from interleaved parent updates (high)

`src/app/api/folders/[id]/route.ts:67-123` loads the tree, calls `wouldCreateFolderCycle` (`src/lib/folder-tree.ts:92-107`), then updates. No transaction, no parent-row lock, no re-check in the `UPDATE … WHERE`.

Both PATCHes returned 200. DB:

- `BUGHUNT-RACE-CYA-mu4gdn4n-0` `84b03e5e-2924-40de-9647-b17c95e9d402` parent `cb954a8b-05e8-40f8-98c3-d79cb76e8bf7`
- `BUGHUNT-RACE-CYB-mu4gdn56-0` `cb954a8b-05e8-40f8-98c3-d79cb76e8bf7` parent `84b03e5e-2924-40de-9647-b17c95e9d402`

### B4. Folder name uniqueness is check-then-insert with no constraint (high)

`src/app/api/folders/route.ts:76-103` selects a clash, then inserts. `folders` has no unique index (`src/db/schema.ts:206-215`). 10 parallel creates of `BUGHUNT-RACE-FOLDUP-mu4gdn1y` all 201. DB count **10**.

### B5. Lost updates: status, tags, result notes (high)

No `updated_at` / version predicate on the `UPDATE`.

- Case status: `src/app/api/cases/[id]/route.ts:98-174` reads `existing`, then updates by id only. 10 responses claimed `ready|blocked|deprecated|draft`. Final row `ready`. Activity rows are all `from_value=draft` (3→ready, 3→blocked, 2→deprecated). The audit log is not a serial history.
- Tags: `src/app/api/cases/route.ts:228-252` reads tags, unions in memory, writes the whole array. 10 adds kept only `bughunt-race-tag-1` plus `seed`. One 200 body even returned `["seed","bughunt-race-tag-0"]`, which is not what is stored.
- Result status: `src/app/api/runs/[id]/route.ts:192-219` always sets `notes` (default `""`) and status with no compare-and-swap. 10 responses each reported a different status. Stored result `b5ad3d21-89af-4e15-9cea-6e2a0107aad2` is `passed` / `note-0`. A concurrent `failed` can open triage then be overwritten (`openTriageForResult` at line 221; fingerprint upsert is also read-modify-write at `src/lib/ci-ingest.ts:145-178`).

### B6. Run complete race double-dispatches (high)

`src/app/api/runs/[id]/route.ts:121-142` returns early only if the **read** already saw `completed`. The update has no `WHERE status <> 'completed'`. Eight parallel completes all 200. `completedAt` values: `…35.673Z` through `…35.675Z` (eight distinct). Each call that wrote also called `dispatchWebhook("run.completed", …)`.

CI complete (`src/app/api/ci/runs/[id]/complete/route.ts:36-70`) has the same shape and does not parse the body. A `POST` of `{` to a live run id returned 200 and marked it completed.

### B7. Duplicate shard rows and a lying counter (high)

`storeShardPayload` (`src/lib/ci-ingest.ts:182-207`) is check-then-insert. `run_shards` has no unique `(run_id, shard_index)` (`src/db/schema.ts:331-339`). Counter update is a blind write of `shards.length` (`src/app/api/ci/runs/[id]/shards/route.ts:77-85`), not an increment under lock.

Eight posts of `shardIndex: 1`. Response that won: `received: 5`, `shard.total: 4`, summary `total: 5`. DB now: **7** rows at index 1, `shards_received=5`. Failures after the insert are empty 500s (partial shard writes).

### B8. Double-submit delete returns 200 `{}` (medium)

`src/app/api/cases/[id]/route.ts:208-221` and `src/app/api/folders/[id]/route.ts:155-176` check existence, then delete. `NextResponse.json({ case: undefined })` drops the undefined field.

Case `8bc7af0c-4976-4430-af59-c3ab98509f87`: both DELETEs **200**. Bodies:

```json
{}
```

and `{ "case": { "id": "8bc7af0c-4976-4430-af59-c3ab98509f87", "key": "BUGHUNT-RACE-DEL-mu4gdngq", … } }`. Follow-up GET 404. Folder delete same pattern: one body `{}`, one the deleted row. Not idempotent 404 vs 200.

### B9. Duplicate pending invites (medium)

`src/app/api/workspace/route.ts:157-191` checks membership, not existing pending invites, and `workspace_invites.email` is not unique per workspace. 8×201 for `bughunt-race-mu4gdnop@example.com`. DB count **8**.

## Malformed body → 500 instead of 400

Unguarded `await request.json()` (or `request.formData()`). Both `{` and `not-json` produced the same status. HTTP body was empty. Server log:

```
⨯ SyntaxError: Expected property name or '}' in JSON at position 1 (line 1 column 2)
    at JSON.parse (<anonymous>)
POST /api/ci/junit 500
⨯ SyntaxError: Unexpected token 'o', "not-json" is not valid JSON
    at JSON.parse (<anonymous>)
POST /api/ci/runs 500
```

| Status | Method | Route | Why |
| --- | --- | --- | --- |
| 500 | POST | `/api/cases` | `src/app/api/cases/route.ts:73` |
| 500 | POST | `/api/runs` | `src/app/api/runs/route.ts:53` |
| 500 | PATCH | `/api/runs/:id` | `src/app/api/runs/[id]/route.ts:63` |
| 500 | POST/PATCH | `/api/workspace` | `:132`, `:228` |
| 500 | POST/PATCH | `/api/roles` | `:106`, `:156` |
| 500 | POST/PATCH | `/api/projects` | `:62`, `:136` |
| 500 | POST/PATCH | `/api/milestones` | `:72`, `:125` |
| 500 | POST | `/api/issues` | `:81` |
| 500 | POST/PATCH/DELETE | `/api/webhooks` | `:59`, `:137`, `:186` |
| 500 | PATCH | `/api/settings` | `:60` |
| 500 | PATCH | `/api/triage` | `:45` |
| 500 | POST | `/api/import/csv` | `:71` (non-multipart) |
| 500 | POST | `/api/ci/junit` | `:45` |
| 500 | POST | `/api/ci/runs` | `:54` |
| 500 | POST | `/api/ci/runs/:id/shards` | `:57` after run exists (fake id 404s first) |
| 500 | POST | `/api/results/:id/comments` | `:79` after result exists (fake id 404s first) |
| 500 | POST | `/api/results/:id/attachments` | `:74` `formData()` after result exists |

Correct 400s (try/catch already present): `POST /api/views`, `POST /api/folders`, `PATCH /api/folders/:id`, `PATCH /api/cases/:id` → `{"error":"Invalid JSON body"}`. `POST /api/auth/session` → `400 "Bad request."`.

Not a parser 500: GET-only routes 405 (`/api/search`, `/api/health`, `/api/flake`, `/api/cases/:id/activity`, `/api/attachments/:id`, `/api/import/csv/template`). `POST /api/agent` 401 `{"error":"Missing bearer token"}` before JSON. `DELETE /api/views/:id` and invite POST 404 before body parse. `POST /api/ci/runs/:id/complete` does not read JSON; `{` on a real id **completed the run** (200).

```json
[
  {
    "id": "B1",
    "severity": "high",
    "title": "Unique violation is HTTP 500; server log leaks SQL, params, constraint, stack",
    "where": "src/app/api/roles/route.ts:130",
    "also": ["src/lib/project.ts:283", "src/lib/ci-ingest.ts:24", "src/app/api/ci/junit/route.ts:94"]
  },
  {
    "id": "B2",
    "severity": "high",
    "title": "JUnit unique race leaves in_progress runs (partial write)",
    "where": "src/app/api/ci/junit/route.ts:71"
  },
  {
    "id": "B3",
    "severity": "high",
    "title": "Interleaved folder parent updates create a cycle",
    "where": "src/app/api/folders/[id]/route.ts:77"
  },
  {
    "id": "B4",
    "severity": "high",
    "title": "Parallel folder creates duplicate names; no unique constraint",
    "where": "src/app/api/folders/route.ts:76"
  },
  {
    "id": "B5",
    "severity": "high",
    "title": "Lost updates on case status, tags, and run result notes",
    "where": "src/app/api/cases/[id]/route.ts:143"
  },
  {
    "id": "B6",
    "severity": "high",
    "title": "Parallel run complete rewrites completedAt and redispatches webhook",
    "where": "src/app/api/runs/[id]/route.ts:121"
  },
  {
    "id": "B7",
    "severity": "high",
    "title": "Same shard index inserts duplicate rows; shards_received is a lost update",
    "where": "src/lib/ci-ingest.ts:187"
  },
  {
    "id": "B8",
    "severity": "medium",
    "title": "Double-submit delete returns 200 {}",
    "where": "src/app/api/cases/[id]/route.ts:216"
  },
  {
    "id": "B9",
    "severity": "medium",
    "title": "Parallel invites create duplicate pending rows for one email",
    "where": "src/app/api/workspace/route.ts:179"
  },
  {
    "id": "B10",
    "severity": "medium",
    "title": "Unguarded request.json/formData returns empty 500 instead of 400",
    "where": "src/app/api/cases/route.ts:73"
  }
]
