# CI token project header

Date: 2026-09-17. No commit. Owned files: `src/lib/ci-auth.ts`, `src/lib/ci-auth.test.ts`.

## Fixed

`authenticateCiRequest` used to ignore `x-topology-project-id` and always bind the token workspace. A demo token plus another project's header stored the run in the default workspace (`ensureDefaultWorkspace()`), and a stored token did the same with `api_tokens.workspace_id`.

A present header that is not a UUID equal to that token workspace (case-insensitive, trimmed) now returns **403** `{ error: "x-topology-project-id does not match token" }`. That includes a foreign project id, a malformed id, and an empty header. The header is never used as the workspace id.

An absent header still uses the token workspace. The env demo token path still calls `ensureDefaultWorkspace()` and treats that id as the token workspace, then applies the same header check. A stored-token mismatch returns before `lastUsedAt` is updated. This path does not create memberships.

Session project selection in `src/lib/project.ts` was not changed. `POST /api/agent` still uses the token workspace when this helper returns ok; a mismatched header now fails in `authenticateCiRequest` before that route writes.
