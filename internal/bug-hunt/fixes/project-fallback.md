# Project id fallback

Date: 2026-09-17. No commit. Owned files: `src/lib/project.ts`, `src/lib/project.test.ts`.

## Fixed

`pickAccessibleProject` no longer substitutes `projects[0]` when the client sent a project id. An explicit id that is not in the accessible list returns `undefined`. `resolveActiveProject` then returns `null`. `requireProjectAccess` returns **403** `{ error: "No accessible project" }`, which existing route handlers already return as JSON.

That covers a preferred id that is unknown, malformed, archived (archived rows are omitted from `listUserProjects`), or not a membership — including a foreign workspace id on project PATCH/DELETE, which previously authorized some other project the caller admins and then mutated the requested id.

A missing preference still uses the first accessible project. That is an omitted `x-topology-project-id` and no project cookie, or an explicit `null` / empty string after trim. This path does not create or join memberships.

`allowArchived` still resolves a real membership, including an archived project, and skips the membership query unless the id is a UUID so a malformed id cannot 500 in Postgres before the 403.

## Callers

Session routes that call `requireProjectAccess` or `resolveActiveProject` check the failure (`!access.ok` or `!ctx`) before using `ctx.project.id`. None of them write after a rejected id. `GET /api/projects` reports `activeProjectId: null` and does not write. App pages render `NoProjectEmptyState` instead of another project's data. A stale cookie is an explicit id, so the shell no longer silently switches projects.

CSV import/export still rejects on its own before the helper (`src/app/api/import/csv/route.ts`): malformed **400**, unknown membership **404**. That comment still says the helper falls back; that sentence is stale. An archived membership that the CSV pre-check allows through now gets 403 from `requireProjectAccess` instead of a write into another project.

## Still ignores the header

These paths never call `pickAccessibleProject`, so a bad header is not rejected here. They bind the token workspace and can still write there:

- `authenticateCiRequest` in `src/lib/ci-auth.ts` — the env demo token uses `ensureDefaultWorkspace()`; a stored token uses `api_tokens.workspace_id`. `POST /api/ci/runs` inserts that id.
- `POST /api/agent` uses the same token workspace. `create_issue` / `link_issue` refuse a result whose workspace differs from that id; they do not follow `x-topology-project-id`.

`ensureMembership` in `src/lib/workspace.ts` (layout and pages) can still insert an admin row on the default workspace. That is separate from this fallback and was not changed.
