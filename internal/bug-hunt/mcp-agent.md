# Agent API and MCP break test

Live target: `http://127.0.0.1:4317` (`src/app/api/agent/route.ts`, `packages/mcp`). Token used was the local demo bearer, which `authenticateCiRequest` binds to the default workspace (`3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf`). A second workspace already existed (`test`, `8f861e9a-6cdc-4d2d-a1e7-52fdd7de8de7`). Cross-workspace issue rows created by this probe were deleted after evidence was captured. Prompt-injection text in case fields was stored, not executed.

## Coverage

| Probe | Result |
| --- | --- |
| GET/POST with no `Authorization` | 401 `Missing bearer token` |
| Wrong bearer | 401 `Invalid API token` |
| Token in `?token=` / `?access_token=` (alone or with a wrong header) | 401. Query string is not an auth path |
| `Authorization: Basic`, `X-Api-Key`, `bearer` (lowercase scheme) | 401 |
| Bearer with extra spaces (`Bearer   <token>  `) | 200. Accepted because the token is `trim()`ed (`src/lib/ci-auth.ts:30`). Not treated as a bypass |
| Unknown `resource` / unknown `action` | 400 `Unknown resource` / `Unknown action` |
| Missing fields and wrong types (`title` number, `priority` `P9`, `tags` string, `runId` number) | 400 Zod `flatten()`, no stack |
| Empty title | 400 `Too small: expected string to have >=1 characters` |
| Empty body and malformed JSON | 500, **0-byte body** (no stack/SQL in the response) |
| `resource=results&runId=not-a-uuid` and a SQL-comment run id | 500, **0-byte body**. Query is parameterized (no injection). Dev server log contains the SQL and workspace id |
| 2MB `description` on `create_case` | 200, stored. Later `GET ?resource=results` nested that description (`TOP-13`, 2,000,000 chars) and returned ~4MB |
| `create_case` / `create_run` with another `workspaceId`, `status: "archived"`, and a foreign `createdById` | Ignored. Case landed in the token workspace with `status: "ready"` |
| `create_run` with a case id from workspace `test` | 200, `caseCount: 0`, run created only in the token workspace, zero `run_results` |
| `record_result` / `GET results` / `GET cases?q=` / `scenario_context` aimed at workspace `test` | 404 or empty cases. No foreign rows in the filtered JSON |
| `GET results` with no `runId` | Response did not include the foreign result id. Query itself is not workspace-scoped (see AGENT-005) |
| Prompt-injection title/description/steps (`BUGHUNT-AGENT-INJECT`) | Stored verbatim. Response was only `{ case }`. No extra run, no delete, SQL fragment not executed |
| MCP `tools/list` vs README vs route | Same 10 tools. No unimplemented tool. No extra route action. Schema mismatches and error wrapping below |
| MCP process | Started `npx tsx packages/mcp/src/server.ts`, listed tools, killed (exit 143). Not left running |

MCP tools advertised and implemented: `list_cases`, `create_case`, `list_runs`, `create_run`, `list_results`, `record_result`, `whats_pending`, `get_scenario_context`, `create_issue`, `link_issue`.

## Findings

### AGENT-001 high — `create_issue` / `link_issue` ignore the token workspace

`POST /api/agent` takes `workspaceId` only from the bearer token, then passes parsed issue bodies to helpers that load `run_results` by id alone and write `linked_issues` (and triage updates) into **that result's** workspace.

The route never compares `authResult.workspaceId` to the result:

```293:320:src/app/api/agent/route.ts
    if (action === "create_issue") {
      const parsed = createIssueSchema.safeParse(body);
      // ...
      const issue = await createIssueFromResult({
        ...parsed.data,
        userId: authResult.userId,
      });
      return NextResponse.json({ issue });
    }

    if (action === "link_issue") {
      // ...
      const issue = await linkExistingIssue({
        ...parsed.data,
        userId: authResult.userId,
      });
```

```57:67:src/lib/issues.ts
  const result = await db.query.runResults.findFirst({
    where: eq(runResults.id, input.resultId),
    with: { case: true, run: true },
  });
  if (!result) throw new Error("Result not found");
  if (result.status !== "failed" && result.status !== "blocked") {
    throw new Error("Issues can only be filed from failed or blocked results");
  }

  const workspaceId = result.run?.workspaceId ?? result.case?.workspaceId;
```

`linkExistingIssue` is the same lookup and does not even require `failed`/`blocked` (`src/lib/issues.ts:144-166`). Both paths also `update triage_items set status = 'resolved'` by `result_id` with no workspace predicate (`src/lib/issues.ts:108-111` and `169-173`). `createIssueFromResult` then `dispatchWebhook("issue.created", ..., workspaceId)` for the victim workspace (`src/lib/issues.ts:113-133`). This database had no webhook rows, so that side effect was not live-fired.

Contrast: `create_case`, `create_run`, and `record_result` in the same route refuse or ignore foreign ids. `record_result` on the foreign run returned 404 `Run not found`.

**Live evidence (token workspace `3f0ddc37-…`, victim workspace `8f861e9a-…`):**

- `link_issue` on untested result `609dec59-9665-46df-802b-fc9722ceaae9` (run `78082907-4d29-4aae-9a8a-a1d068bc7999` in workspace `test`) returned **200**. The row was inserted with `workspace_id = 8f861e9a-6cdc-4d2d-a1e7-52fdd7de8de7`, `created_by_id = 35b1fc6b-91cd-4038-b22c-96bd2da6751f` (the demo user behind this token), `remote_key = BUGHUNT-AGENT-1`. The victim result stayed `untested`.
- `create_issue` on that same untested id returned **400** `Issues can only be filed from failed or blocked results` — not 404. The handler found a result outside the token workspace (existence oracle) and only then applied the status rule.
- `create_issue` on a failed result in that same foreign run (`a22ddd94-5a8f-471f-8ba5-3ad3983f158f`) returned **200** with `issue.workspaceId = 8f861e9a-6cdc-4d2d-a1e7-52fdd7de8de7`, `runId = 78082907-4d29-4aae-9a8a-a1d068bc7999`, `title = BUGHUNT-AGENT-filed-from-other-ws`, `provider = mock`.

Both linked-issue rows and the failed fixture result were deleted after the check. Supplying `workspaceId` on `create_case` / `create_run` did **not** retarget those actions; this hole is specifically the issue helpers, and MCP `create_issue` / `link_issue` call them.

UUIDs are not enumerable. Impact still requires knowing a result id (CI payload, export, log, or shared URL). Once known, any agent token can attach a tracker issue in another project and, for `create_issue`, emit that project's webhooks.

### AGENT-002 medium — caught DB errors return SQL and bind parameters

The POST `catch` returns `err.message` as JSON. A duplicate case key (`BUGHUNT-AGENT-INJECT`) produced **400** whose body started with `Failed query: insert into "cases" ...` and ended with bind params, including the token workspace id and user id. No stack frame was in that body (`PostgresError` / `duplicate key` text also absent; the Drizzle wrapper message is the SQL).

```324:326:src/app/api/agent/route.ts
  } catch (err) {
    const message = err instanceof Error ? err.message : "Agent API failed";
    return NextResponse.json({ error: message }, { status: 400 });
```

Tail of the response: `params: 3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf,BUGHUNT-AGENT-INJECT,BUGHUNT-AGENT-dup-probe,,,,P2,ready,{},35b1fc6b-91cd-4038-b22c-96bd2da6751f`.

Zod failures (missing fields, wrong types, non-UUID `caseIds`) stay as `flatten()` objects and do not include SQL.

### AGENT-003 low — invalid input crashes GET/POST outside the JSON catch

`request.json()` sits outside the `try` (`src/app/api/agent/route.ts:150`). Empty body and `{not json` returned **500** with a 0-byte body. `GET ?resource=results&runId=not-a-uuid` has no UUID check and no `try` (`src/app/api/agent/route.ts:68`) and also returned **500** with a 0-byte body.

The HTTP responses did **not** include a stack or SQL. The Next dev log did: `Failed query: select ... from "runs"` plus `invalid input syntax for type uuid: "not-a-uuid"` and `at async GET (src/app/api/agent/route.ts:68:19)`, with the token workspace id in the bind params. A quoted `OR 1=1` run id was bound as a parameter, not concatenated. `Accept: text/html` did not change the empty body.

### AGENT-004 low — MCP schema is looser than the route, and object errors become `[object Object]`

`tools/list` matched the README. `delete_all_cases` is rejected (`Tool delete_all_cases not found`). Nothing advertised is unimplemented, and the route has no mutating action the schema omits.

Mismatches (client accepts, route rejects):

- `create_run.caseIds` is `z.array(z.string())` (`packages/mcp/src/server.ts:52`) vs `z.array(z.string().uuid())` (`src/app/api/agent/route.ts:112`).
- `record_result.runId`, `create_issue.resultId`, and `link_issue.resultId` are plain strings in MCP, UUIDs on the route.
- `create_case.title` is `z.string()` in MCP (empty string allowed by the tool schema) vs `.min(1)` on the route.

Calling MCP `create_run` with `caseIds: ["not-a-uuid"]` returned `isError: true` and text `[object Object]`. The route 400 body is a Zod `flatten()` object; `TopologyClient` does `String(error)` (`packages/mcp/src/client.ts:33-36`), which hides field errors. Not extra server power.

Caller-supplied `projectKey` / `teamId` / `repo` / provider tokens are not in either schema and are stripped by the route Zod objects before `createIssueFromResult`. Provider enum `mock|jira|linear|github` is in both schemas (server credentials, not a hidden tool).

### AGENT-005 low — unscoped `results` read, then in-memory filter

```75:81:src/app/api/agent/route.ts
    const rows = await db.query.runResults.findMany({
      where: runId ? eq(runResults.runId, runId) : undefined,
      with: { case: true, run: true },
      limit: 200,
    });
    const scoped = rows.filter((r) => r.run?.workspaceId === workspaceId);
```

With no `runId`, the query has no workspace predicate and no order. Live: 273 results in the database, response contained 199, and the known foreign result id was not included. Fail-closed for the JSON body (missing `run` is dropped). Residual: other-workspace rows are loaded into the process, and the caller's own rows can be omitted once the global table exceeds 200. `whats_pending` is scoped by workspace run ids and did not include the foreign result.

### AGENT-006 low — no application body cap; list embeds the full case

`create_case` accepted a 2,000,000-character `description` (key `TOP-13`, title `BUGHUNT-AGENT-huge`). `GET ?resource=results` then returned 199 rows whose nested case descriptions totaled 4,006,582 characters, max description 2,000,000 on `TOP-13`. A token can inflate later `list_results` / `list_cases` responses. Not a cross-workspace write.

## Not bugs

- Auth failures and query-string tokens do not authenticate.
- Injection-looking titles are data. `BUGHUNT-AGENT-INJECT` was stored as a single case in the token workspace (`status` stayed `ready` despite `status: "archived"`). No second action ran.
- `record_result`, case search, and run fetch stay inside the token workspace when a foreign id is supplied.
- MCP does not advertise a tool the route lacks, and does not grant a tool the route refused, aside from AGENT-001 which is implemented on both sides.

## Residue in the token workspace

Left in place (not deleted): case `BUGHUNT-AGENT-INJECT`, case `TOP-13` / `BUGHUNT-AGENT-huge` (2MB description), empty run `BUGHUNT-AGENT-cross-run` (`89d32b7f-13ca-4f4d-8a37-b9f2981f1547`). Cross-workspace linked issues `55f9fdf3-f1d6-4847-89d2-173884ff59f9` and `ededc076-7768-402c-bede-c482a53abc7c`, and fixture result `a22ddd94-5a8f-471f-8ba5-3ad3983f158f`, were removed.

```json
[
  {
    "id": "AGENT-001",
    "severity": "high",
    "title": "create_issue and link_issue write the result's workspace, not the token workspace",
    "file": "src/app/api/agent/route.ts",
    "line": 301,
    "also": ["src/lib/issues.ts:57", "src/lib/issues.ts:144", "src/lib/issues.ts:108", "src/lib/issues.ts:169"]
  },
  {
    "id": "AGENT-002",
    "severity": "medium",
    "title": "Duplicate-key and other caught DB errors return the SQL text and bind parameters",
    "file": "src/app/api/agent/route.ts",
    "line": 325
  },
  {
    "id": "AGENT-003",
    "severity": "low",
    "title": "Malformed JSON and non-UUID runId return empty 500; SQL and stack only in the dev log",
    "file": "src/app/api/agent/route.ts",
    "line": 68,
    "also": ["src/app/api/agent/route.ts:150"]
  },
  {
    "id": "AGENT-004",
    "severity": "low",
    "title": "MCP input schema is looser than the route; object errors stringify to [object Object]",
    "file": "packages/mcp/src/server.ts",
    "line": 52,
    "also": ["packages/mcp/src/client.ts:35", "src/app/api/agent/route.ts:112"]
  },
  {
    "id": "AGENT-005",
    "severity": "low",
    "title": "GET results loads up to 200 rows globally, then filters by workspace in memory",
    "file": "src/app/api/agent/route.ts",
    "line": 75
  },
  {
    "id": "AGENT-006",
    "severity": "low",
    "title": "No body size cap; list_results embeds full case descriptions (2MB stored, ~4MB listed)",
    "file": "src/app/api/agent/route.ts",
    "line": 167
  }
]
```
