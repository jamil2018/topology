# Settings, members, and webhooks bug hunt

Local target: `http://127.0.0.1:4317` as `demo@topology.local`. Probe emails and webhook descriptions used the `BUGHUNT-SET-` prefix. Webhook deliveries were only aimed at `http://127.0.0.1:9`. No external hosts, no cloud metadata, no `db:seed` / `db:push` / migrate / integration / e2e, server not restarted.

After the probes, `demo@topology.local` was confirmed admin on every membership row (`5/5`). Disposable `bughunt-set-*` users, their memberships, and pending `bughunt-set%` invites were removed in the database because the product has no revoke/remove API. A separate local admin (`bughunt-authz-*`) was left untouched.

## Coverage

| Area | Attempt | Result |
| --- | --- | --- |
| `PATCH /api/settings` extra fields / `role` / `passwordHash` / email swap | 200, email stayed `demo@topology.local`; unknown keys stripped | No mass assignment |
| Invalid `themePreference` (`hacked`, empty) | 400 flatten | Rejected |
| Empty PATCH, array body, name over 120, whitespace name | 400 | Rejected |
| Wrong current password, new password shorter than 6 | 400 | Rejected |
| Same password as current plus extra `role` | 200 (rehash of the same password; login still works) | Not escalation |
| Invite existing member / self, including different case | 409 User is already a member | Rejected |
| Malformed, empty, missing role, `role: owner` | 400 flatten | Rejected |
| CRLF email, NUL email | 400 flatten | Rejected |
| Huge email (3027 and ~4027 chars) | 201, stored, rendered on Access page (`main` text length 9742) | **Bug** |
| Duplicate pending invite, second one `role: admin` for the same address | 201 both times | **Bug** |
| Revoke via DELETE/PATCH `/api/workspace`, DELETE/PATCH `/api/invites/:token` | 405; no UI control | **Bug** |
| Accept as the wrong user, twice | 403 both times; token stayed pending | Not consumed by failure |
| Accept as the invited user, then reuse token | 200 then 404; anonymous GET 404 | Single-use after success |
| Eight parallel accepts of one token | 3×200, 5×500 (empty body); one membership row | **Bug** (500s) |
| Invalid member role `owner` | 400 | Rejected |
| Sole-admin self-demote (`role`, `roleId`, conflicting pair) | 400 Cannot demote yourself | Guard holds |
| Archive system admin role | 400 System roles cannot be archived | Guard holds |
| Wipe system admin `actions` via `PATCH /api/roles` | 200, stored action count 0, `canAdmin` stayed true via legacy enum; actions restored to 22 | Roles integrity gap |
| Second admin demotes demo | 200 on the active project; demo restored to admin | No last-admin count check |
| Remove self / remove member | DELETE `/api/workspace` 405; UI has no remove | Missing capability |
| `javascript:` webhook URL | 200 stored, secret echoed; created disabled so dispatch skipped it | **Bug** |
| Empty URL / non-URL | 400 | Rejected |
| `http://127.0.0.1:9` create + test dispatch | 200; `lastStatus` 0 and `lastDeliveredAt` set | **SSRF confirmed** |
| Toggle enabled off/on | Secret still equal to the value just set on GET and PATCH | **Secret leak** |
| Viewer GET webhooks / workspace | Secret match true; 18/18 invite tokens; writes 403 | **Bug** |
| User with zero memberships GET `/api/workspace` | Inserted as `admin`, `canAdmin=true`, tokens returned | **Bug** |
| Delete webhook twice / random UUID | 200 `{ok:true}` both times | **Bug** |
| Settings UI (`account`, `access`, `members`, `integrations`, `webhooks`, `projects`) | Playwright session `bughunt-settings`, profile `/tmp/bughunt-settings`. Console errors: 0 | No page crash |

Zod `z.string().url()` in this repo also accepts `file:`, `data:`, `ftp:`, `ws:`, and `http://169.254.169.254/` (parser check only; those URLs were not stored or fetched).

## Bugs

### 1. Critical — signed-in user with no membership becomes admin

`GET /api/workspace` calls `ensureMembership(userId, "admin")` and `requireProjectAccess`, which also calls `ensureMembership(userId, "admin")` when the user has no projects. The helper inserts a **default-workspace admin** row when none exists. Opening `/settings` does the same with the default argument `"admin"`.

Live: inserted `bughunt-set-outsider@topology.local` with a password and **zero** `workspace_members` rows. Login + `GET /api/workspace` returned `200`, `role=admin`, `canAdmin=true`, **18 invite tokens**, and `member_n=4`. Database role was `admin`. Membership was then deleted.

That user is not invited and does not pass the invite email check. Any credential/OAuth account that is not yet a member of the default workspace is promoted on first contact with settings or workspace APIs, then can read every pending invite token (bug 4) and, because they are admin, invite and manage roles.

- `src/app/api/workspace/route.ts:47`
- `src/app/(app)/settings/page.tsx:17`
- `src/lib/workspace.ts:38` (default `role = "admin"`) and `:72-80` (insert)
- `src/lib/project.ts:177-179`

### 2. High — webhook HMAC secrets returned to any member, including viewers

`GET /api/webhooks` does not require `webhooks.manage`. It returns the raw row, including `secret`. `POST` and `PATCH` echo `secret` as well. The settings panel stores the JSON in React state (`setEndpoints(data.endpoints)`), so the secret is in the browser even though the list UI does not render it.

Live:

- Create `http://127.0.0.1:9` with a probe secret: `secret_echo=true` on create, GET, and after `enabled` toggle.
- A user accepted as **viewer** (`canAdmin=false`) `GET /api/webhooks` → 200, secret matched. Same user `DELETE` → 403 `Missing permission: webhooks.manage`.

- `src/app/api/webhooks/route.ts:16-30` (GET, no action)
- `src/app/api/webhooks/route.ts:110` (POST returns row)
- `src/app/api/webhooks/route.ts:164` (PATCH returns row)
- `src/components/webhooks-panel.tsx:33`

### 3. High — stored SSRF: server fetches arbitrary webhook URLs

Create schema is `z.string().url()` with no http(s) allowlist and no private-IP block. `dispatchWebhook` `fetch`es the stored URL (redirects followed by default, 8s timeout) for every enabled endpoint subscribed to the event. `POST {action:"test"}` fans out to **all** matching endpoints in the workspace, not one id. The test handler returns `{ok:true}` even when delivery fails; the UI then says the test was dispatched.

Live (only `http://127.0.0.1:9`, no other endpoints, `envFallback=false`):

- Create 200, `enabled=1`.
- Test dispatch 200, `event=run.completed`.
- Subsequent GET: `lastStatus=0`, `lastDeliveredAt` set (connection to the closed port was attempted; catch path stores status 0).
- `javascript:alert(1)` was stored (200) when created with `enabled=false` so the test dispatch did not fetch it. Empty and non-URL bodies were 400.

- `src/app/api/webhooks/route.ts:34` (url schema)
- `src/app/api/webhooks/route.ts:61-87` (test fans out)
- `src/lib/webhooks.ts:51-56` (fetch)
- `src/lib/webhooks.ts:68-79` (failure → `lastStatus` 0)
- `src/components/webhooks-panel.tsx:81-93` (treats any 200 as success)

### 4. High — invite tokens listed to every member; no revoke; duplicates allowed

`GET /api/workspace` has no `members.invite` / admin check. Each pending invite includes the raw `token`. The Access page puts that payload in React state. There is no revoke handler even though `invite_status` includes `revoked`. The pending-invite UI has no revoke or remove control. There is no unique constraint on `(workspace_id, email)` while status is pending.

Live:

- Viewer (`canAdmin=false`) `GET /api/workspace` → 18 invites, **18 tokens**. Invite and role-change from that viewer were 403.
- Zero-membership user (bug 1) received the same token list after being auto-promoted.
- Two pending rows for `bughunt-set-1@topology.local`: one `member`, one `admin` (second create used a different case; email is lowercased, role is not deduped).
- `DELETE`/`PATCH` revoke attempts: 405. Accept URL with the token is also returned on create (`201`).
- Unauthenticated `GET /api/invites/:token` returns email, role, and workspace name while pending (invite page needs this; combined with token listing it is how a stolen settings response becomes a join link).
- Emails of 3027+ characters were stored and drawn into the Access page with no truncation (`src/components/workspace-members-panel.tsx:260-264`).

- `src/app/api/workspace/route.ts:41-51` (GET, no action)
- `src/app/api/workspace/route.ts:100-111` (token in list)
- `src/app/api/workspace/route.ts:157-191` (no pending-duplicate check, no max email length)
- `src/db/schema.ts:69-73` and `:186-204` (`revoked` exists; no unique on pending email)
- `src/app/api/invites/[token]/route.ts:10-34` (public preview)

### 5. Medium — concurrent accept returns 500; status update is not conditional

Successful accept then reuse is correct: `200` then `404 Invite not found`. Eight parallel `POST /api/invites/:token` calls as the matching user returned **3×200 and 5×500**. The 500 body was empty (no stack in the response). Exactly one membership row was created (`UNIQUE (workspace_id, user_id)`). The insert is not wrapped so the loser throws instead of returning 404. The status write is `WHERE id = invite.id` and does not require `status = 'pending'`.

- `src/app/api/invites/[token]/route.ts:67-86`

### 6. Medium — cannot remove members; last-admin guard is self-only

There is no delete-member route or button. `DELETE /api/workspace` is 405. Self-demote of the only remaining admin is 400 `Cannot demote yourself` (`role`, `roleId`, and conflicting `role: admin` + viewer `roleId`). A **different** admin can demote demo: `bughunt-set-admin2` `PATCH` returned `200 member_role=viewer` on the active project. Demo was immediately restored (all demo memberships admin afterward, `5/5`).

So the last admin cannot remove themselves, and nobody can remove a member through the API. A second admin can still demote every other admin until one remains. That second admin can appear without an invite (bug 1).

- `src/app/api/workspace/route.ts:251-260` (self-demote only)
- `src/components/workspace-members-panel.tsx:196-207` (role `<select>` only)

### 7. Low — webhook delete always succeeds

Second delete of the same id, and delete of `00000000-0000-0000-0000-000000000000`, both returned `200 {ok:true}`. The query result is ignored.

- `src/app/api/webhooks/route.ts:194-203`

### 8. Low — system admin role actions can be cleared

`PATCH /api/roles` with the admin system role id and `actions: ["cases.read"]` returned 200 with action count **0** (unknown key dropped, empty array stored). `GET /api/workspace` still reported `canAdmin=true` because the legacy `workspace_members.role` enum was unchanged. Actions were restored to 22. Archive of the system role was correctly 400. Deep custom-role authorization is out of this report beyond this settings intersection.

- `src/app/api/roles/route.ts:198-200` (no system-role guard on `actions`)
- `src/lib/project.ts:100-101` (`canAdmin(membership.role)` keeps admin)

## What did not break

- Settings profile PATCH does not change email, id, or role.
- Invalid theme enum, bad invite role, existing-member invite, and self-invite are rejected.
- Failed accept (wrong account) does not burn the token.
- Happy-path accept is single-use (second POST 404).
- Viewer cannot invite, change roles, or delete webhooks (those writes are gated).
- Sole last admin cannot self-demote.
- Settings pages produced no browser console errors in the Playwright session.

```json
[
  {
    "id": "set-01",
    "severity": "critical",
    "title": "User with no membership is inserted as workspace admin on GET /api/workspace and /settings",
    "evidence": "bughunt-set-outsider had 0 memberships; GET /api/workspace returned 200 role=admin canAdmin=true and 18 invite tokens; DB role was admin",
    "locations": [
      "src/app/api/workspace/route.ts:47",
      "src/app/(app)/settings/page.tsx:17",
      "src/lib/workspace.ts:38",
      "src/lib/project.ts:177"
    ]
  },
  {
    "id": "set-02",
    "severity": "high",
    "title": "Webhook secrets returned on GET/POST/PATCH to any project member, including viewers",
    "evidence": "Viewer GET /api/webhooks 200 with secret match; viewer DELETE 403 webhooks.manage; create/PATCH/GET echoed secret",
    "locations": [
      "src/app/api/webhooks/route.ts:16",
      "src/app/api/webhooks/route.ts:110",
      "src/components/webhooks-panel.tsx:33"
    ]
  },
  {
    "id": "set-03",
    "severity": "high",
    "title": "Stored SSRF: webhook fetch has no URL allowlist; private IP probe was fetched",
    "evidence": "javascript: URL stored; http://127.0.0.1:9 test dispatch 200 then lastStatus 0 with lastDeliveredAt set; test fans out to every matching endpoint",
    "locations": [
      "src/app/api/webhooks/route.ts:34",
      "src/app/api/webhooks/route.ts:61",
      "src/lib/webhooks.ts:51"
    ]
  },
  {
    "id": "set-04",
    "severity": "high",
    "title": "Pending invite tokens listed to viewers; no revoke; duplicate admin invite allowed",
    "evidence": "Viewer GET returned 18/18 tokens; revoke routes 405; second pending invite for the same email stored role=admin; 3027-char email stored and rendered",
    "locations": [
      "src/app/api/workspace/route.ts:41",
      "src/app/api/workspace/route.ts:108",
      "src/app/api/workspace/route.ts:157",
      "src/db/schema.ts:186"
    ]
  },
  {
    "id": "set-05",
    "severity": "medium",
    "title": "Concurrent invite accept returns empty 500s",
    "evidence": "8 parallel POSTs: 3x200 and 5x500 (body length 0); one membership row. Sequential reuse after success is 404",
    "locations": [
      "src/app/api/invites/[token]/route.ts:74"
    ]
  },
  {
    "id": "set-06",
    "severity": "medium",
    "title": "No member removal; last-admin guard is self-demote only",
    "evidence": "DELETE /api/workspace 405; self-demote 400; a second admin PATCH demoted demo to viewer (restored afterward)",
    "locations": [
      "src/app/api/workspace/route.ts:251",
      "src/components/workspace-members-panel.tsx:196"
    ]
  },
  {
    "id": "set-07",
    "severity": "low",
    "title": "Webhook DELETE reports success when no row is deleted",
    "evidence": "Second delete and delete of a nil UUID both returned 200 {ok:true}",
    "locations": [
      "src/app/api/webhooks/route.ts:194"
    ]
  },
  {
    "id": "set-08",
    "severity": "low",
    "title": "System admin role actions can be cleared via PATCH /api/roles",
    "evidence": "PATCH actions [cases.read] stored action count 0; canAdmin stayed true via legacy enum; actions restored to 22",
    "locations": [
      "src/app/api/roles/route.ts:198"
    ]
  }
]
```
