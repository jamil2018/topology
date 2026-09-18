# Access control fixes

Date: 2026-09-17. No commit. Database was not dropped. Dev server on 4317 was not restarted.

## Fixed

| Bug | Behavior now |
| --- | --- |
| AUTHZ-002 / BH-AUTH-001 / set-01 / default-project-auto-admin | `ensureMembership` does not insert a membership unless `create: true` (seed and the multi-project integration bootstrap only). `GET /`, `GET /api/projects`, `GET /api/workspace`, and the app layout no longer auto-join. A signed-in user with no membership gets **403** `No accessible project` from workspace and other `requireProjectAccess` routes, not a default-workspace admin row. |
| AUTHZ-001 / project-idor-patch-delete / project-idor-metadata-read | `PATCH` and `DELETE /api/projects` require the caller to administer the requested id. A fallback project they already admin does not authorize a foreign id. Unknown or unauthenticated-to-them ids are **403**. A non-member no longer sees another workspace's name via `archived: false`. Deleting the default project is still **400** only after that membership check. |
| AUTHZ-003 / AGENT-001 / agent-issue-ignores-token-workspace / BUGHUNT-ISSUE-001 | Issue create, link, refresh, close, and ack take the caller's project (session project, or the API token workspace). A result or issue outside that workspace is **404** `Result not found` / `Linked issue not found`, before the failed/blocked rule, so a foreign id is not an existence oracle. `ack_retest` of a missing id is **404**, not `200 {}`. |
| BUGHUNT-ISSUE-002 | Refresh does not copy a sibling's title when several rows share a mock remote id. It does not replace a local `done` with a remote `open`, and it does not apply a fabricated `mock-linked-*` stand-in. |
| AUTHZ-004 / set-02 / set-04 (token leak) | `GET /api/workspace` omits invite `token` unless the caller has `members.invite`. Admin-role invite tokens are omitted unless the caller is a system admin. `GET /api/webhooks` omits `secret` unless the caller has `webhooks.manage`. |
| set-03 | Webhook URLs must be `http:` or `https:`. `javascript:` and other schemes are **400**. Dispatch skips loopback and private targets (`127.0.0.0/8`, `localhost`, `::1`, `0.0.0.0`, `169.254.0.0/16`, `10/8`, `172.16/12`, `192.168/16`, IPv4-mapped forms, IPv6 link-local and unique-local) and does not follow redirects. No outbound probe was added. |
| AUTHZ-005 / set-08 | `PATCH /api/roles` rejects action edits on system roles (**400**). Effective actions for a system role come from the catalog for `systemKey`, so a stored Viewer action list cannot grant `canAdmin`. |
| AUTHZ-006 | Custom action sets are never stored as `admin` (`inferLegacyRole` is member or viewer). `ctxCanWrite` does not OR the legacy enum for a non-system custom role, so `members.invite` alone does not pass `write: true`. Inviting or assigning the admin role requires a system admin. |
| BH-AUTH-001 (invite leftover) | Accepting an invite when the user is already a member returns **409** and does not mark the invite accepted. A pending viewer invite therefore cannot be burned on top of an existing admin row. Concurrent duplicate membership is **409** via `err.cause` `23505`, not an empty **500**. |
| BH-AUTH-004 (callback only) | The login form honors a same-origin `callbackUrl` (`/invite/<token>`). Absolute, protocol-relative, and backslash targets fall back to `/`. No signup path was added. |
| AGENT-002 / AGENT-003 / name-null JSON (projects) / BUGHUNT-ISSUE-005 | In the routes edited here, malformed JSON is **400** `Invalid JSON body`. Non-UUID project, role, and agent `runId` values are **400** before the uuid column is queried. Postgres `23505` is read from `err.cause` and returned as **409**. Response bodies do not include `Failed query` or stack traces. |

## Files changed

- `src/lib/workspace.ts`, `src/lib/project.ts`
- `src/app/(app)/layout.tsx`, `(home)/page.tsx`, `settings/page.tsx`, `triage/page.tsx`, `milestones/page.tsx`, `automation/page.tsx`
- `src/app/api/projects/route.ts`, `workspace/route.ts`, `roles/route.ts`, `webhooks/route.ts`, `issues/route.ts`, `agent/route.ts`, `invites/[token]/route.ts`
- `src/lib/issues.ts`, `src/lib/permissions.ts`, `src/lib/webhooks.ts`, `src/lib/http-errors.ts`
- `src/app/login/page.tsx`, `src/components/login-form.tsx`
- `src/db/seed.ts` (`create: true` bootstrap only), `tests/integration/multi-project.integration.test.ts` (new-user bootstrap only)

## Skipped

- BH-AUTH-002 (cookie CSRF / Origin). No existing auth-config hook covers app routes. A site-wide check is not a small fix.
- BH-AUTH-003 (JWT still valid after logout and password change). Needs a session version or database sessions. Not added.
- BH-AUTH-005 / BH-AUTH-006 (login rate limit and timing). `src/auth.ts` was not in the owned set.
- Signup for invited emails (rest of BH-AUTH-004). No register route was added.
- Unknown/archived `x-topology-project-id` fallback for folders and CSV, demo token ignoring the project header on CI ingest, folder cycles, and duplicate folder names. Those files were out of scope. Project PATCH/DELETE no longer uses that fallback.
- Milestone readiness, flake limit, double-filing the same result, and unsanitized link keys. Not the assigned issue slice.
- AGENT-004 (MCP schema), AGENT-005 (unscoped results read then filter), AGENT-006 (body size). Agent route was not rewritten.
- Member removal, last-admin is self-demote only, duplicate pending invites, huge invite emails, webhook DELETE always `{ok:true}`. Not in the must-fix list. No schema change (`schema.ts` was left alone).
- Cases, runs, and report pages still call `ensureMembership`. The helper no longer inserts, so those calls cannot mint an admin row. Those pages were left unread by the ownership split.

## Tests

`npx vitest run --config vitest.packages.config.ts` — 28 passed:

- `src/lib/permissions.test.ts`
- `src/lib/project.test.ts`
- `src/lib/webhooks.test.ts`
- `src/lib/issues.refresh.test.ts`
- `src/lib/workspace-roles.test.ts`

`npx vitest run --config vitest.ui.config.ts src/components/login-form.test.tsx` — 3 passed.

No `test:e2e`, no `db:seed`.
