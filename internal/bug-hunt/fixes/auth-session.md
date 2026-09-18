# Auth / session fixes

Date: 2026-09-17. No commit. Database was not migrated or seeded. Dev server on 4317 was not restarted.

## Fixed

| Bug | Behavior now |
| --- | --- |
| BH-AUTH-002 (password change only) | `PATCH /api/settings` that includes `password` rejects a cross-site `Origin` or `Referer` with **403** `Cross-site request rejected`. Same-origin is allowed. Missing both headers (non-browser clients) is allowed. `Origin: null`, another port, and `localhost` vs `127.0.0.1` count as cross-site. Checked before the password compare, so a hostile origin does not get a success or "incorrect password" result. |
| BH-AUTH-003 (password change) | Auth.js `jwt` callback stamps a SHA-256 of `passwordHash` when the token is issued (`trigger` `signIn` / `signUp`). Later session checks compare that claim to the current hash and return `null` when it does not match. Auth.js already treats a `null` JWT callback as "no session" (`GET /api/auth/session` body `null`, session cookie cleared on that response). No denylist table and no migration. `passwordHash` is the version the app already has. The stamp is not copied onto the client session. Tokens issued before this claim exist fail closed, so a live session must sign in again once. After a password change, the old JWT no longer passes `auth()`; the browser that changed the password must sign in with the new one. |
| BH-AUTH-004 (callbackUrl) | Already fixed in `src/components/login-form.tsx` and `src/app/login/page.tsx`. Same-origin paths such as `/invite/<token>` are kept. Absolute, protocol-relative, and backslash targets fall back to `/`. Not redone. |

## Files changed

- `src/auth-session.ts`, `src/auth-session.test.ts`
- `src/auth.ts` (JWT stamp check)
- `src/app/api/settings/route.ts` (origin check on password change)

`src/middleware.ts` was not edited. Next.js 16 deprecates `middleware.ts` in favor of `proxy.ts` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md`). This app's middleware is the Auth.js `authorized` gate and must stay edge-safe (no database). A site-wide Origin check there would also cover non-credential cookie mutations, which were out of scope. The password handler is the credential mutation.

## Skipped

- BH-AUTH-003 (logout). `POST /api/auth/signout` already clears the session cookie (`sessionStore.clean()`, `Max-Age=0` in the live run). Auth.js emits `events.signOut` with the decoded token and then clears the cookie. There is no revocation hook that makes the JWT itself expire. Credentials cannot use database sessions (`Credentials` provider requires JWT). The global JWT `salt` is the cookie name, not a per-user value, and there is no `sessionVersion` column. A denylist or version column would be a new table or migration. Not added. A saved `authjs.session-token` still decrypts until its `exp` after sign-out.
- BH-AUTH-002 outside password change. The only credential mutation is `PATCH /api/settings` with `password`. Invite create and other cookie mutations were not edited (already owned by the access-control pass, and not credential changes).
- BH-AUTH-005. Login rate limiting was not added.
- BH-AUTH-006. Timing oracle was not changed (not in the must-fix list).
- Signup for invited emails. No register route was added.

## Tests

`npx vitest run --config vitest.config.ts src/auth-session.test.ts` — 3 passed.

No `test:e2e`, no `db:seed`, no restart of port 4317.
