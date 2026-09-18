# Auth / session break test

Date: 2026-09-17. Live `http://127.0.0.1:4317`. Credentials `demo@topology.local` / `topology-demo`. Scope: login page, sessions, invite accept, password edges, unauthenticated page and cookie-session APIs. Bearer CI token was not in scope. No code changes. Dev server left running. Seeded demo user was not deleted.

Prefixed fixtures were removed after evidence was captured so the default workspace is not left with an extra admin. Ids below are from the live responses, not still in the database. Do not confuse with `bughunt-authz-*` rows from another tester (left untouched).

- Users created then deleted: `bughunt-auth-new@example.com` (`21ac6d71-a92c-4e93-998b-ac78d6f23f91`, became **admin**) and `bughunt-auth-invitee@example.com` (`691ba1a4-54f1-496c-b443-05b130181c1e`, stayed viewer).
- Invites created then deleted: viewer/new/expired/csrf `bughunt-auth-*@example.com` rows.

## Coverage (what you tried, including things that held)

| Attempt | Result |
| --- | --- |
| Happy-path credentials login | **302**, `authjs.session-token` set. `GET /api/auth/session` returns demo user id `35b1fc6b-91cd-4038-b22c-96bd2da6751f`. |
| Wrong password, empty email, empty password, 5-char password, unknown user, non-email, SQL-ish email (`' OR 1=1--`, `demo@topology.local' OR '1'='1`), SQL-ish password | All **302** `http://localhost:4317/login?error=CredentialsSignin&code=credentials`. No session cookie. No query error. |
| Unicode homoglyph email (`dеmo@…` with Cyrillic е) | **302** CredentialsSignin. Did not match the demo account. |
| 72 / 5_000 / 100_000 character password against the demo user | **302** CredentialsSignin in ~85ms. No hang. bcrypt truncates; no body-size DoS observed. |
| 12 failed logins in a row | Every attempt **302** CredentialsSignin (~82–93ms). No 429, no lockout. Bug BH-AUTH-005. |
| Unknown-user vs wrong-password timing | ~16ms vs ~84ms. Same error code. Bug BH-AUTH-006. |
| Session cookie flags | `HttpOnly`; `SameSite=Lax`; `Path=/`; `Expires` ~30 days (16 Oct 2026). **No `Secure`**, no `Domain` (host-only). Expected on this HTTP origin; see residual risk. |
| Garbage / `alg=none` / empty `authjs.session-token` | `/api/auth/session` **200** `null`. `/`, `/api/settings` **307** to login. Not accepted. |
| Unauthenticated `/`, `/runs`, `/cases`, `/settings`, `/automation`, `/milestones`, `/triage`, `/reports`, `/runs/new`, `/connect` | **307** to `/login?callbackUrl=…`. No app HTML. |
| Unauthenticated `POST /api/cases`, `PATCH /api/settings`, `POST /api/workspace`, `DELETE /api/cases/:id`, `GET /api/cases`, `GET /api/settings`, `GET /api/workspace` | **307** to login. No JSON bodies. |
| `GET /api/auth/session` with no cookie | **200** `null`. |
| `GET /api/health` | **200** `{"status":"ok",…}`. Public by `auth.config.ts` design. |
| Signup / register / forgot-password / `/api/users` | No handler. Middleware **307** to login. OAuth sign-in (`github`, `google`) **302** `error=Configuration`. No self-registration path. Invite emails cannot create an account (BH-AUTH-004). |
| Open redirect `callbackUrl=https://evil.example/phish`, `http://evil.example/phish`, `javascript:alert(1)`, `http://127.0.0.1:4317@evil.example/`, `http://evil.example@127.0.0.1:4317/` | Credentials callback **302** `Location: http://localhost:4317` (origin fallback). Did not follow off localhost. |
| `callbackUrl=//evil.example/phish` and `///evil.example` | **302** `Location: http://localhost:4317//evil.example/phish` (and `///evil.example`). Host stays `localhost`. Not an off-site redirect in this response. |
| `callbackUrl=http://localhost:4317\@evil.example/` | **302** `Location: http://localhost:4317\@evil.example/`. Host in the header is still localhost. Not fetched. |
| `callbackUrl=http://127.0.0.1:4317/cases` while the process treats origin as `localhost` | Dropped. **302** `Location: http://localhost:4317` (not `/cases`). Host mismatch. Residual, not an external redirect. |
| `X-Forwarded-Host: evil.example` on `/api/auth/providers`, `/api/auth/csrf`, `/runs` | Did **not** redirect to `evil.example`. Origin stayed `localhost` / relative `/login`. |
| Login page `callbackUrl` with `<img onerror>` and `</script>` | Reflected inside the Next.js flight payload, tags escaped (`\u003c` or percent-encoded). No raw `</script>` breakout. Not XSS. |
| `GET /api/auth/signout?callbackUrl=https://evil.example/phish` | **200** confirmation form. Session still valid. Form posts back to this app. |
| `POST /api/auth/signout` without CSRF | **302** `error=MissingCSRF`. Session kept. Auth.js CSRF on sign-out **held**. |
| `POST /api/auth/signout` with CSRF and `callbackUrl=https://evil.example/phish` | Cookie cleared (`Max-Age=0`). **302** `Location: http://localhost:4317`, not evil.example. Stolen pre-logout JWT still valid (BH-AUTH-003). |
| Invite missing / guess (`guess-me`, SQL-ish token) | `GET /api/invites/:token` **404** `Invite not found`. Page copy: missing/revoked/accepted. |
| Invite expired (token `d34672cd…` `expires_at` set to yesterday) | `GET` and `POST` **410** `{"error":"Invite expired"}`. Page: “This invite has expired.” |
| Invite reused after accept | Second `POST` **404** `Invite not found`. |
| Accept as the wrong email | **403** `Signed in as bughunt-auth-invitee@example.com, but invite is for bughunt-auth-expired@example.com`. |
| Accept body `{role:"admin", customRoleId:<admin uuid>}` on a viewer invite, before any workspace call | **200** `{ok:true}` but membership stayed **viewer**. Client role ignored. |
| Viewer `POST /api/workspace` `{role:"admin"}` | **403** `Missing permission: members.invite`. Existing membership is not upgraded by `ensureMembership`. |
| Invite `role: "owner"` | **400** enum (`admin\|member\|viewer` only). |
| Unauthenticated `POST /api/invites/:token` | **401** `Sign in to accept invite`. `GET` does not mutate. |
| Invite token entropy | 24 random bytes, hex (48 chars) in `src/app/api/workspace/route.ts`. Guessing not practical. |
| Cookie session APIs with `Origin: https://evil.example` and no CSRF token | Invite create **201**; password change **200**. Bug BH-AUTH-002. |

## Bugs

### BH-AUTH-001 — First authenticated request with no membership is granted workspace admin, and a pending viewer invite does not stop it

- **id:** BH-AUTH-001
- **severity:** high
- **title:** New accounts are auto-provisioned as workspace admin; invite role is skipped if they open the app first
- **steps:**
  1. As demo (admin), `POST /api/workspace` `{ "email": "bughunt-auth-new@example.com", "role": "viewer" }` (201, token `993a997c7700f853a3cc357191a984b031067c1c73c52d78`).
  2. Create a credential user for that email (no membership).
  3. Sign in as that user. `GET /api/workspace` with the session cookie and **do not** accept the invite first.
  4. `POST /api/invites/993a997c…` as that user.
  5. `GET /api/workspace` again.
- **expected:** A user with no membership stays out (or is created only at the invited role). Accepting a viewer invite must not leave them as admin.
- **actual:** Step 3 returned `me.role` **admin**, `canAdmin: true`, and `members.invite` in `actions`. The row was inserted by `ensureMembership(userId, "admin")` before the permission check. Step 4 returned `{ok:true}` but did not change the existing membership. Step 5 still `role: "admin"`.
- **evidence:** `GET /api/workspace` body snippet: `"me":{"userId":"21ac6d71-a92c-4e93-998b-ac78d6f23f91","role":"admin","canAdmin":true,… "members.invite","roles.manage"}`. Accept response `200 {"ok":true}`. Code: `ensureMembership` defaults `role` to `"admin"` and inserts when no row exists (`src/lib/workspace.ts:38-80`). Called unconditionally from `GET`/`POST /api/workspace` (`src/app/api/workspace/route.ts:47` and `:121`) and from `resolveActiveProject` when the user has zero projects (`src/lib/project.ts:176-179`) and the app layout (`src/app/(app)/layout.tsx:17`). Invite accept inserts only `if (!existing)` and still marks the invite accepted (`src/app/api/invites/[token]/route.ts:74-86`).
- **suggested fix:** Stop inserting a membership as a side effect of read/authz. If a user has no membership, return 403. When accepting an invite for an existing member, do not mark it accepted without applying or rejecting the invited role. Never default a brand-new membership to admin except the explicit bootstrap of the first operator.

### BH-AUTH-002 — Cookie-authenticated mutations ignore Origin and have no CSRF token

- **id:** BH-AUTH-002
- **severity:** medium
- **title:** Session-cookie POST/PATCH succeeds with a hostile Origin and no CSRF token
- **steps:**
  1. Sign in as demo. `POST /api/workspace` with the session cookie, `Content-Type: application/json`, **no** `Origin`, body `{ "email": "bughunt-auth-invitee@example.com", "role": "viewer" }`.
  2. Repeat with `Origin: https://evil.example` and `Referer: https://evil.example/csrf` for `bughunt-auth-csrf@example.com`.
  3. Sign in as `bughunt-auth-invitee@example.com`. `PATCH /api/settings` with only the session cookie and `Origin: https://evil.example`, body `{ "password": { "currentPassword": "BUGHUNT-AUTH-pass-local-only", "newPassword": "BUGHUNT-AUTH-rotated-local" } }`.
- **expected:** State-changing cookie routes reject missing/cross-site `Origin` (or require a CSRF token), the way `POST /api/auth/signout` rejects a missing CSRF token (`302 error=MissingCSRF`).
- **actual:** Step 1 **201**. Step 2 **201** (invite `21d30b55-1ff9-4b87-8003-46f7c9600391`). Step 3 **200** with `hasPassword: true`; the old password then got CredentialsSignin and the new password signed in. `src/` has no Origin or CSRF check on these handlers.
- **evidence:** Statuses above. Password response snippet: `{"profile":{"id":"691ba1a4-54f1-496c-b443-05b130181c1e",…"hasPassword":true}`. Session cookie is `SameSite=Lax`, so a third-party site in a modern browser would not send it on a cross-site POST. Same-site cross-origin callers (another port on `127.0.0.1`, or a sibling subdomain in a deployed host) would, and the server would accept them. Auth.js sign-out CSRF held; app routes did not.
- **suggested fix:** Require a same-origin `Origin`/`Sec-Fetch-Site` (or a CSRF token bound to the session) on cookie-authenticated `POST`/`PATCH`/`DELETE`, including `/api/settings` and `/api/invites/:token`.

### BH-AUTH-003 — Logout and password change do not revoke the JWT

- **id:** BH-AUTH-003
- **severity:** medium
- **title:** Stolen session cookie stays valid after sign-out and after password change
- **steps:**
  1. Sign in as `bughunt-auth-new@example.com`. Save `authjs.session-token`.
  2. `POST /api/auth/signout` with a valid CSRF token (`callbackUrl=/login`). Observe `set-cookie: authjs.session-token=; Max-Age=0`.
  3. `GET /api/auth/session` and `GET /api/workspace` with the **saved** token, not the cleared jar.
  4. Separately, change `bughunt-auth-invitee` password (BH-AUTH-002), then `GET /api/auth/session` with the pre-change token.
- **expected:** Sign-out and password change invalidate outstanding sessions. Replay of the old cookie is 401 / `null`.
- **actual:** After sign-out the old token still returned the user JSON (`expires` `2026-10-16T18:47:45.973Z`, about 30 days). `GET /api/workspace` with that token still returned the workspace. After the password change, the old invitee token still returned the user object. Strategy is JWT (`src/auth.config.ts:44`); the `sessions` table is unused for credentials.
- **evidence:** Sign-out response `set-cookie: authjs.session-token=; Max-Age=0` and `location: http://localhost:4317/login`. Replay body: `{"user":{"name":"BUGHUNT-AUTH bughunt-auth-new@example.com","email":"bughunt-auth-new@example.com",…}}`. Cookie `Expires=Fri, 16 Oct 2026` (30-day `maxAge` in Auth.js defaults).
- **suggested fix:** Use database sessions, or keep a `sessionVersion` / password-changed timestamp in the user row and reject JWTs minted before it. Sign-out should bump that version server-side, not only clear the browser cookie.

### BH-AUTH-004 — Login ignores callbackUrl, so invite accept cannot return to the invite

- **id:** BH-AUTH-004
- **severity:** medium
- **title:** Invite “sign in to accept” drops callbackUrl and there is no way to create the invited account
- **steps:**
  1. Open `/invite/<viewer token>` signed out. The page links to `/login?callbackUrl=/invite/<token>` and calls `signIn(undefined, { callbackUrl: /invite/<token> })`.
  2. Sign in with the email form.
  3. Look for a register/signup route (`/signup`, `/register`, `/api/signup`, `/api/register`, `/api/users`, OAuth).
- **expected:** After a successful password sign-in, the browser returns to `/invite/<token>` so the user can accept. If the email has no account, there is a scoped way to set a password for that invite.
- **actual:** The email form always posts `callbackUrl: "/"` and then sets `window.location.href = "/"` (`src/components/login-form.tsx:27-38`). It never reads the query param. Same-origin `http://127.0.0.1:4317/cases` is also discarded by the Auth.js callback because this process’s origin is `http://localhost:4317` (credentials **302** `Location: http://localhost:4317`, not `/cases`). Signup routes 307 to login. GitHub/Google sign-in is `error=Configuration`. An invite for an email with no `passwordHash` cannot be completed.
- **evidence:** `src/components/invite-accept-client.tsx:65-72` builds the callback URL. Login form hardcodes `/`. `GET /api/auth/signin/github` **302** `http://localhost:4317/api/auth/error?error=Configuration`. Invite `POST` requires `session.user.email` (`src/app/api/invites/[token]/route.ts:38-41`) and credentials `authorize` returns null without `passwordHash` (`src/auth.ts:45-48`).
- **suggested fix:** Honor a same-origin `callbackUrl` after credentials sign-in (the Auth.js redirect callback already rejects other origins). Either provision a password (or magic link) for the invited email, or document that invites only work for existing accounts and disable the “sign in to accept” path that drops the user on `/`.

### BH-AUTH-005 — No rate limit or lockout on credential sign-in

- **id:** BH-AUTH-005
- **severity:** medium
- **title:** Repeated failed logins are unlimited
- **steps:** `POST /api/auth/callback/credentials` 12 times as `demo@topology.local` with distinct wrong passwords (`fail-bughunt-auth-0` … `11`), each with a fresh CSRF cookie.
- **expected:** After a small number of failures, 429 or a temporary lockout, same error text either way.
- **actual:** All 12 returned `HTTP/1.1 302` `location: http://localhost:4317/login?error=CredentialsSignin&code=credentials` in 82–93ms. No `Retry-After`. Password schema is `z.string().min(6)` with no max (`src/auth.ts:13-16`). Settings new-password max is 128 (`src/app/api/settings/route.ts:17-19`); login is not.
- **evidence:** 12-tuple of `(302, …CredentialsSignin…, ~84ms)`. No throttle in `authorize` (`src/auth.ts:41-51`).
- **suggested fix:** Rate-limit the credentials callback per IP and per email (and add a max password length on the login schema so a huge body cannot be used as a cheap CPU burn even though 100k chars did not hang here).

### BH-AUTH-006 — Credential check timing distinguishes unknown emails from wrong passwords

- **id:** BH-AUTH-006
- **severity:** low
- **title:** Login timing oracle for account existence
- **steps:** Alternate 5 unknown emails (`no-such-bughunt-auth-N@example.com` / `topology-demo`) with 5 wrong passwords for `demo@topology.local`.
- **expected:** Comparable latency, or a dummy bcrypt compare when the user is missing.
- **actual:** Unknown user ~16–17ms. Existing user, wrong password ~82–88ms. Both `CredentialsSignin` (no message difference). The error string on the login form is also generic (`Invalid email or password`).
- **evidence:** `unknown_ms [17, 16, 16, 16, 17]` `badpw_ms [85, 88, 84, 86, 82]`. `authorize` returns null before `compare` when `passwordHash` is missing (`src/auth.ts:45-50`).
- **suggested fix:** Always run `compare` against a dummy hash when the user is absent, and keep the same status and redirect.

## Residual risk

- Off-site open redirect via `callbackUrl` did **not** succeed. External URLs fell back to `http://localhost:4317`. Protocol-relative `//evil.example` was prefixed onto that origin (`http://localhost:4317//evil.example/phish`) and was not followed. `X-Forwarded-Host: evil.example` did not change the redirect host.
- Session cookie is `HttpOnly` + `SameSite=Lax` and not `Secure`, because the live origin is HTTP. Fine on `127.0.0.1`. If this process is ever exposed over plain HTTP beyond localhost, the cookie can be sent in the clear. Auth.js will mark it `Secure` only when the URL it believes is HTTPS.
- Successful credentials `Location` is `http://localhost:4317…` even when the request host is `127.0.0.1`. The cookie is host-only (no `Domain`). A browser that follows that 302 will not send the `127.0.0.1` cookie to `localhost`. The in-app form avoids this by setting `window.location` to `/` (`src/components/login-form.tsx:38`). `trustHost: true` is set (`src/auth.config.ts:45`); forwarded-host injection did not move the origin off localhost in this run.
- `GET /api/auth/error?error=Configuration` returned **500** with the Auth.js HTML error chrome and no stack or secret in the body.
- Unauthenticated `GET /api/invites/:token` returns email, role, and workspace slug. Token is 192 bits. Treated as the invite secret, not a bug, once you already have the link.
- No public signup, so BH-AUTH-001 is not reachable by an anonymous internet client until an account exists (SQL, a future signup, or OAuth if `AUTH_*` is set — the Drizzle adapter would create the user, then the first request would admin-promote them).

```json
[
  {
    "id": "BH-AUTH-001",
    "severity": "high",
    "title": "First authenticated request with no membership is granted workspace admin; a pending viewer invite does not downgrade it",
    "area": "auth",
    "file": "src/lib/workspace.ts",
    "repro_summary": "Sign in as a credential user with no workspace_members row and GET /api/workspace. Response me.role is admin (user 21ac6d71-a92c-4e93-998b-ac78d6f23f91). POST the pending viewer invite still returns 200 and leaves role admin."
  },
  {
    "id": "BH-AUTH-002",
    "severity": "medium",
    "title": "Cookie-authenticated mutations ignore Origin and have no CSRF token",
    "area": "auth",
    "file": "src/app/api/settings/route.ts",
    "repro_summary": "PATCH /api/settings with only the session cookie and Origin https://evil.example changed bughunt-auth-invitee password (200). POST /api/workspace with the same hostile Origin created an invite (201). Sign-out without CSRF is rejected."
  },
  {
    "id": "BH-AUTH-003",
    "severity": "medium",
    "title": "Logout and password change do not revoke the JWT",
    "area": "auth",
    "file": "src/auth.config.ts",
    "repro_summary": "After POST /api/auth/signout clears the cookie (Max-Age=0), the saved authjs.session-token still returns the user on GET /api/auth/session and GET /api/workspace until the 30-day exp. The pre-change invitee token still worked after a password change."
  },
  {
    "id": "BH-AUTH-004",
    "severity": "medium",
    "title": "Login ignores callbackUrl and invites cannot create an account",
    "area": "auth",
    "file": "src/components/login-form.tsx",
    "repro_summary": "Email sign-in always callbackUrl / then window.location=/. Invite page links to /login?callbackUrl=/invite/<token> but that query is unused. No signup route; GitHub/Google sign-in is Configuration. Credentials login requires an existing passwordHash."
  },
  {
    "id": "BH-AUTH-005",
    "severity": "medium",
    "title": "No rate limit or lockout on credential sign-in",
    "area": "auth",
    "file": "src/auth.ts",
    "repro_summary": "12 consecutive wrong passwords for demo@topology.local each returned 302 CredentialsSignin in ~84ms with no 429. Login password schema is min(6) with no max."
  },
  {
    "id": "BH-AUTH-006",
    "severity": "low",
    "title": "Credential check timing distinguishes unknown emails from wrong passwords",
    "area": "auth",
    "file": "src/auth.ts",
    "repro_summary": "Unknown email logins took ~16ms; wrong password for demo@topology.local took ~84ms. Both redirected as CredentialsSignin. authorize returns before bcrypt when passwordHash is null."
  }
]
```
