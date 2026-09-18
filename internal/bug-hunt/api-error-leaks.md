# API and page error leaks

Date: 2026-09-17. Target: `http://127.0.0.1:4317` (left running). Session cookie for app routes; Bearer token for `/api/ci/*` and `/api/agent`. 378 requests. Server still answered `/api/health` after the last probe. No database DROP.

Probes per route: no auth, authenticated `not-a-uuid`, authenticated body `{`, authenticated mass-assignment JSON (`role`, `workspaceId`, `passwordHash`, `isAdmin`, plus a `name`/`title` so creates could succeed), and `Content-Type: application/json` with body `this-is-not-json`. Then GET on POST-only routes, TRACE, and one ~64KB `Cookie` on `/api/health`.

API 500 responses had **empty bodies**. SQL text was not returned on those calls. The same class of driver error **is** returned on the run and report pages.

---

## Highest severity

### 1. `/runs/not-a-uuid` returns the failed SQL, including `password_hash`

Authenticated `GET /runs/not-a-uuid` is **HTTP 200**. The RSC payload includes `PostgresError`, a stack (`node:internal`, `src/app/`), and the failed statement. Unauthenticated `GET` is **307** to login, so this is session-only.

Confirmed fragments from the response body:

- `PostgresError` / `invalid input syntax for type uuid: "not-a-uuid"`
- `Failed query: select "runs"."id", "runs"."workspace_id…`
- column name `password_hash` in the same payload
- digest `2758491442`

A body of `{` or `this-is-not-json` does not change it. GET ignores the body; the path param is what blows up. The injected hash string `injected-hash` was **not** echoed. `password_hash` is the column name inside the failed query, not a successful mass-assignment.

Cause: `src/app/(app)/runs/[id]/page.tsx` calls `getRunWithResults` (`src/lib/queries.ts`) with the raw path id. That relational query loads `assignee` and `comments.user`. Drizzle selects every `users` column, including `password_hash` (`src/db/schema.ts`). Postgres rejects `not-a-uuid` before a `notFound()`, and the dev error payload serializes `error.message` (the SQL) to the browser. There is no `error.tsx` under `runs/`.

### 2. `/reports/not-a-uuid` returns the failed SQL and a stack

Authenticated `GET /reports/not-a-uuid` is also **HTTP 200** with `PostgresError`, `invalid input syntax for type uuid`, `Failed query`, `node:internal`, and `src/app/` paths. `password_hash` was **not** in this body (this query does not join `users`). Unauthenticated GET is 307.

`src/app/(app)/reports/error.tsx` renders `error.message` into the alert. The flight payload already contains the driver message, so the browser receives the SQL even when the visible alert is redacted.

Cause: `getRunReport` compares `runs.id` to the raw param (`src/lib/queries.ts`). Invalid UUID throws instead of `notFound()`.

---

## Other confirmed bugs

### 3. Bad UUIDs are 500s that should be 400 (empty body)

These authenticated calls returned **500** with an empty body. No SQL, stack, or `password_hash` in the HTTP body. They should be 400 (or 404) before the driver sees the value.

| Call | Why it 500s |
| --- | --- |
| `GET /api/runs/not-a-uuid` | `eq(runs.id, id)` in `src/app/api/runs/[id]/route.ts` |
| `PATCH /api/runs/not-a-uuid` | same path id, and `request.json()` is uncaught (`line 63`) |
| `GET /api/cases?folderId=not-a-uuid` | `listCases` passes `folderId` into `eq(cases.folderId, folderId)` |
| `GET /api/attachments/not-a-uuid` | `eq(attachments.id, id)` before the 404 check |
| `GET /api/results/not-a-uuid/attachments` | result id cast |
| `POST /api/results/not-a-uuid/attachments` | result id cast (valid JSON still 500) |
| `GET /api/results/not-a-uuid/comments` | result id cast |
| `POST /api/results/not-a-uuid/comments` | result id cast (valid JSON still 500) |
| `DELETE /api/roles?id=not-a-uuid` | `eq(workspaceRoles.id, id)` with the query string |
| `DELETE /api/projects?id=not-a-uuid` | `getMembershipForProject` casts `workspaceId` before `deleteProject`. The project was **not** deleted. |
| `POST /api/ci/runs/not-a-uuid/complete` | `eq(runs.id, id)` with Bearer. Valid JSON still 500. |
| `POST /api/ci/runs/not-a-uuid/shards` | same |

`GET` where POST is expected on the CI routes is **405**, which is fine. TRACE is not (below).

### 4. Malformed JSON is a 500, not a 400

`{` and `this-is-not-json` with `Content-Type: application/json` both returned **500** and an empty body on handlers that call `request.json()` outside `try/catch`. A valid JSON body on the same route often returned **400** (schema reject) or **201** (name accepted), which shows the 500 is the parse, not the extra fields.

| Method | Route |
| --- | --- |
| PATCH | `/api/triage`, `/api/roles`, `/api/workspace`, `/api/projects`, `/api/webhooks`, `/api/milestones`, `/api/settings` |
| POST | `/api/runs`, `/api/import/csv`, `/api/agent`, `/api/roles`, `/api/cases`, `/api/issues`, `/api/ci/junit`, `/api/ci/runs`, `/api/workspace`, `/api/projects`, `/api/webhooks`, `/api/milestones` |
| DELETE | `/api/webhooks` (no JSON / `{` / non-JSON). Valid JSON with `id: "not-a-uuid"` was **400**. |

Handlers that already catch `request.json()` stayed at 400: `POST /api/folders`, `POST /api/views`, `PATCH /api/cases`, `PATCH/DELETE /api/folders/not-a-uuid`, `GET/PATCH/DELETE /api/cases/not-a-uuid`, `GET /api/cases/not-a-uuid/activity`, `DELETE /api/views/not-a-uuid`.

### 5. TRACE is 500, not 405

`TRACE` returned **500** `text/html` (Next error shell) on `/api/health`, `/api/cases`, `/api/settings`, `/api/ci/junit`, `/api/ci/runs/not-a-uuid/complete`, `/api/ci/runs/not-a-uuid/shards`, `/api/auth/callback/credentials`, and `/runs/not-a-uuid`. The HTML body did not contain `Failed query`, `password_hash`, or a Postgres error. Server stayed up.

### 6. Oversized Cookie did not kill the server

One `GET /api/health` with a ~64KB `Cookie` returned **431**. A follow-up `/api/health` still returned 200. That test was stopped after the single request; it did not need a crash note.

### Mass-assignment: no privilege write, some probe rows created

Extra fields were not reflected as `isAdmin` or `injected-hash` on API JSON. Zod strips unknown keys. `PATCH /api/settings` mass-assignment was **400**, so the demo password was not replaced.

These writes **did** succeed because `name`/`title` were valid and extra fields were ignored:

| Call | Status |
| --- | --- |
| `POST /api/folders` | 201 |
| `POST /api/runs` | 201 |
| `POST /api/roles` | 201 (`name` mass-probe) |
| `POST /api/cases` | 201 |
| `POST /api/ci/runs` | 201 |
| `POST /api/workspace` | 201 |
| `POST /api/projects` | 201 |
| `POST /api/milestones` | 200 |

Those rows are named `mass-probe` / `MASS-PROBE`. Disposable side effect only.

### What did not leak

- No unauthenticated SQL, stack, or `password_hash`. Session routes **307** to login. CI and agent **401** without Bearer.
- `GET /cases` and `GET /cases?folderId=not-a-uuid` are 200. The page ignores the query. The API `folderId` probe is the one that 500s.
- `GET /invite/not-a-uuid` is public **200** with the missing-invite copy. Token is text, not a uuid cast. `GET /api/invites/not-a-uuid` is **404**. `POST` is **401**.
- `GET /api/search?q=not-a-uuid` and `GET /api/flake?limit=not-a-uuid` are 200.
- Healthy `GET /api/health` (public 200) did not match SQL/`password_hash`. The handler can return the driver message if the database is down; that path was not hit.
- `GET /api/settings` did not include `password_hash`.

---

## Route matrix

Statuses: no-auth / bad UUID / body `{` / mass-assignment / non-JSON body. Auth column is the credential used for the last four probes.

| Method | Path | Auth | none | bad uuid | `{` | mass | non-JSON |
| --- | --- | --- | --- | --- | --- | --- | --- |
| GET | `/api/triage` | session | 307 | 200 | 200 | 200 | 200 |
| PATCH | `/api/triage` | session | 307 | 500 | 500 | 400 | 500 |
| GET | `/api/folders` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/folders` | session | 307 | 400 | 400 | 201 | 400 |
| PATCH | `/api/folders/not-a-uuid` | session | 307 | 400 | 400 | 400 | 400 |
| DELETE | `/api/folders/not-a-uuid` | session | 307 | 400 | 400 | 400 | 400 |
| GET | `/api/runs` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/runs` | session | 307 | 500 | 500 | 201 | 500 |
| GET | `/api/runs/not-a-uuid` | session | 307 | 500 | 500 | 500 | 500 |
| PATCH | `/api/runs/not-a-uuid` | session | 307 | 500 | 500 | 500 | 500 |
| GET | `/api/import/csv` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/import/csv` | session | 307 | 500 | 500 | 400 | 500 |
| GET | `/api/import/csv/template` | session | 307 | 200 | 200 | 200 | 200 |
| GET | `/api/agent` | bearer | 401 | 200 | 200 | 200 | 200 |
| POST | `/api/agent` | bearer | 401 | 500 | 500 | 400 | 500 |
| GET | `/api/roles` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/roles` | session | 307 | 500 | 500 | 201 | 500 |
| PATCH | `/api/roles` | session | 307 | 500 | 500 | 400 | 500 |
| DELETE | `/api/roles?id=not-a-uuid` | session | 307 | 500 | 400 | 400 | 400 |
| GET | `/api/views` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/views` | session | 307 | 400 | 400 | 400 | 400 |
| DELETE | `/api/views/not-a-uuid` | session | 307 | 400 | 400 | 400 | 400 |
| GET | `/api/cases` | session | 307 | 500 (`folderId`) | 200 | 200 | 200 |
| POST | `/api/cases` | session | 307 | 500 | 500 | 201 | 500 |
| PATCH | `/api/cases` | session | 307 | 400 | 400 | 400 | 400 |
| GET | `/api/cases/not-a-uuid` | session | 307 | 400 | 400 | 400 | 400 |
| PATCH | `/api/cases/not-a-uuid` | session | 307 | 400 | 400 | 400 | 400 |
| DELETE | `/api/cases/not-a-uuid` | session | 307 | 400 | 400 | 400 | 400 |
| GET | `/api/cases/not-a-uuid/activity` | session | 307 | 400 | 400 | 400 | 400 |
| GET | `/api/attachments/not-a-uuid` | session | 307 | 500 | 500 | 500 | 500 |
| GET | `/api/issues` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/issues` | session | 307 | 500 | 500 | 400 | 500 |
| GET | `/api/results/not-a-uuid/attachments` | session | 307 | 500 | 500 | 500 | 500 |
| POST | `/api/results/not-a-uuid/attachments` | session | 307 | 500 | 500 | 500 | 500 |
| GET | `/api/results/not-a-uuid/comments` | session | 307 | 500 | 500 | 500 | 500 |
| POST | `/api/results/not-a-uuid/comments` | session | 307 | 500 | 500 | 500 | 500 |
| GET | `/api/auth/session` | public | 200 | 200 | 200 | 200 | 200 |
| GET | `/api/auth/csrf` | public | 200 | 200 | 200 | 200 | 200 |
| GET | `/api/auth/providers` | public | 200 | 200 | 200 | 200 | 200 |
| GET | `/api/auth/error` | public | 200 | 200 | 200 | 200 | 200 |
| POST | `/api/auth/callback/credentials` | public | 302 | 302 | 400 | 302 | 400 |
| GET | `/api/auth/not-a-uuid` | public | 400 | 400 | 400 | 400 | 400 |
| POST | `/api/auth/not-a-uuid` | public | 400 | 400 | 400 | 400 | 400 |
| GET | `/api/flake` | session | 307 | 200 | 200 | 200 | 200 |
| GET | `/api/search` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/ci/junit` | bearer | 401 | 500 | 500 | 400 | 500 |
| GET | `/api/ci/runs` | bearer | 401 | 200 | 200 | 200 | 200 |
| POST | `/api/ci/runs` | bearer | 401 | 500 | 500 | 201 | 500 |
| POST | `/api/ci/runs/not-a-uuid/complete` | bearer | 401 | 500 | 500 | 500 | 500 |
| POST | `/api/ci/runs/not-a-uuid/shards` | bearer | 401 | 500 | 500 | 500 | 500 |
| GET | `/api/health` | public | 200 | 200 | 200 | 200 | 200 |
| GET | `/api/workspace` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/workspace` | session | 307 | 500 | 500 | 201 | 500 |
| PATCH | `/api/workspace` | session | 307 | 500 | 500 | 400 | 500 |
| GET | `/api/projects` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/projects` | session | 307 | 500 | 500 | 201 | 500 |
| PATCH | `/api/projects` | session | 307 | 500 | 500 | 400 | 500 |
| DELETE | `/api/projects?id=not-a-uuid` | session | 307 | 500 | 400 | 400 | 400 |
| GET | `/api/invites/not-a-uuid` | public | 404 | 404 | 404 | 404 | 404 |
| POST | `/api/invites/not-a-uuid` | public | 401 | 401 | 401 | 401 | 401 |
| GET | `/api/webhooks` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/webhooks` | session | 307 | 500 | 500 | 400 | 500 |
| PATCH | `/api/webhooks` | session | 307 | 500 | 500 | 400 | 500 |
| DELETE | `/api/webhooks` | session | 307 | 500 | 500 | 400 | 500 |
| GET | `/api/milestones` | session | 307 | 200 | 200 | 200 | 200 |
| POST | `/api/milestones` | session | 307 | 500 | 500 | 200 | 500 |
| PATCH | `/api/milestones` | session | 307 | 500 | 500 | 400 | 500 |
| GET | `/api/settings` | session | 307 | 200 | 200 | 200 | 200 |
| PATCH | `/api/settings` | session | 307 | 500 | 500 | 400 | 500 |
| GET | `/runs/not-a-uuid` | session | 307 | **200 leak** | **200 leak** | **200 leak** | **200 leak** |
| GET | `/reports/not-a-uuid` | session | 307 | **200 leak** | **200 leak** | **200 leak** | **200 leak** |
| GET | `/cases` | session | 307 | 200 | 200 | 200 | 200 |
| GET | `/invite/not-a-uuid` | public | 200 | 200 | 200 | 200 | 200 |

Method confusion (GET on POST-only): `GET /api/auth/callback/credentials` 302; `GET /api/ci/junit` 405; `GET /api/ci/runs/not-a-uuid/complete` 405; `GET /api/ci/runs/not-a-uuid/shards` 405. TRACE on those and on `/api/health`, `/api/cases`, `/api/settings`, `/runs/not-a-uuid` is 500.

Oversized cookie: `GET /api/health` **431**. Server stayed up.

```json
[
  {
    "severity": "high",
    "id": "runs-page-sql-and-password-hash",
    "route": "GET /runs/not-a-uuid",
    "auth": "session",
    "status": 200,
    "leaks": ["Failed query", "invalid input syntax for type uuid", "PostgresError", "password_hash", "node:internal", "src/app/"],
    "digest": "2758491442",
    "shouldBe": "404 or 400, no SQL",
    "note": "Unauthenticated GET is 307. Injected passwordHash value was not echoed; the column name is in the failed SELECT."
  },
  {
    "severity": "high",
    "id": "reports-page-sql",
    "route": "GET /reports/not-a-uuid",
    "auth": "session",
    "status": 200,
    "leaks": ["Failed query", "invalid input syntax for type uuid", "PostgresError", "node:internal", "src/app/"],
    "shouldBe": "404 or 400, no SQL",
    "note": "password_hash not present. reports/error.tsx renders error.message."
  },
  {
    "severity": "medium",
    "id": "uuid-500-empty-body",
    "status": 500,
    "body": "empty",
    "shouldBe": 400,
    "routes": [
      "GET /api/runs/not-a-uuid",
      "PATCH /api/runs/not-a-uuid",
      "GET /api/cases?folderId=not-a-uuid",
      "GET /api/attachments/not-a-uuid",
      "GET /api/results/not-a-uuid/attachments",
      "POST /api/results/not-a-uuid/attachments",
      "GET /api/results/not-a-uuid/comments",
      "POST /api/results/not-a-uuid/comments",
      "DELETE /api/roles?id=not-a-uuid",
      "DELETE /api/projects?id=not-a-uuid",
      "POST /api/ci/runs/not-a-uuid/complete",
      "POST /api/ci/runs/not-a-uuid/shards"
    ],
    "note": "No SQL in the HTTP body. DELETE /api/projects did not delete the project."
  },
  {
    "severity": "medium",
    "id": "malformed-json-500",
    "status": 500,
    "body": "empty",
    "shouldBe": 400,
    "note": "Both `{` and non-JSON with Content-Type application/json. See matrix rows where `{` and non-JSON are 500 while mass-assignment is 400 or 201."
  },
  {
    "severity": "low",
    "id": "trace-500",
    "status": 500,
    "shouldBe": 405,
    "leaks": [],
    "routes": [
      "TRACE /api/health",
      "TRACE /api/cases",
      "TRACE /api/settings",
      "TRACE /api/ci/junit",
      "TRACE /api/ci/runs/not-a-uuid/complete",
      "TRACE /api/ci/runs/not-a-uuid/shards",
      "TRACE /api/auth/callback/credentials",
      "TRACE /runs/not-a-uuid"
    ]
  },
  {
    "severity": "info",
    "id": "oversized-cookie",
    "route": "GET /api/health",
    "status": 431,
    "note": "64KB Cookie. Server still healthy afterward. Not a crash."
  },
  {
    "severity": "info",
    "id": "mass-assignment",
    "note": "role, workspaceId, passwordHash, and isAdmin were not persisted or echoed. Zod stripped them. name/title created mass-probe rows on folders, runs, roles, cases, ci runs, workspace, projects, and milestones."
  }
]
```
