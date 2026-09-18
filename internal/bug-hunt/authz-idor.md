# Authorization and IDOR bug hunt

Date: 2026-09-17. Live `http://127.0.0.1:4317`. Demo `demo@topology.local` (admin of `default` and `Test`). Temporary users (viewer on default, member on default, admin of `Test` only) were inserted with a bcrypt hash the same way `src/db/seed.ts` does, used, then deleted. No code changes, no server restart, no seed/push/migrate. Default project restored to name `Topology`, not archived.

Default `3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf`. Other project used as the attacker's home: `Test` `8f861e9a-6cdc-4d2d-a1e7-52fdd7de8de7`.

---

## Highest severity

1. **Any project admin can rename, archive, or delete any other project** given its UUID. `requireProjectAccess` falls back to a project the caller already admins, then PATCH/DELETE mutate the requested id.
2. **Any signed-in user who is not already a member of the default project is inserted as its admin.** `GET /api/workspace` (and the app layout) call `ensureMembership`, whose default role is `admin`.
3. **A member of one project can close, refresh, or file issues on another project's result/issue ids.** `POST /api/issues` checks write on the caller's project, then loads the target by id only.
4. **Viewers can read webhook signing secrets and pending invite tokens**, including admin invites. GET does not require `webhooks.manage` or `members.invite`.

---

## Coverage

Session vs role vs membership, from the route handlers and live probes.

| Route | Session | Membership | Role / action | Live |
| --- | --- | --- | --- | --- |
| Most `/api/*` | yes (`auth`) | `requireProjectAccess` | write/admin/`action` varies | unauth **307** to `/login` |
| `/api/health` | no | no | no | public by design; returns `attachmentsDir` |
| `/api/ci/*`, `/api/agent` | bearer token, not session | token `workspaceId` | no role check | no token **401**; header does not switch workspace |
| `/api/invites/:token` GET | no | no | no | **200** preview (email, role, workspace name) |
| `/api/invites/:token` POST | yes | no | email must match invite | wrong email **403** |
| `/api/settings` | yes, own user id | no workspace | not admin-only | viewer **200** own profile |
| `/api/workspace` GET | yes | auto-joins default as admin | none on GET | viewer **200**, includes invite tokens |
| `/api/workspace` POST/PATCH | yes | auto-joins first | `members.invite` / `roles.manage` | viewer and member **403** |
| `/api/roles` GET | yes | yes | none | viewer **200** (catalog + role actions) |
| `/api/roles` POST/PATCH/DELETE | yes | yes | `roles.manage` | viewer and member **403** |
| `/api/webhooks` GET | yes | yes | none | viewer **200** with `secret` |
| `/api/webhooks` POST/PATCH/DELETE | yes | yes | `webhooks.manage` | viewer and member **403** |
| `/api/projects` PATCH/DELETE | yes | fallback, not the target id | `project.manage` on fallback | isolated admin **200** on a foreign id |
| `/api/projects` select | yes | preferred id must match | membership | foreign id not selected |
| cases, runs, folders, milestones, triage, search, flake | yes | resource `workspaceId` | per-action | foreign case/run/activity **404**; header swap stays on caller's project |
| comments, attachments | yes | result's run workspace | write on POST | foreign result **404** |
| saved views | yes | workspace + `createdById` | write on delete | other user's view DELETE **404** |
| `/api/issues` POST | yes | caller's project only | `write: true`, not the target id | foreign issue/result **200** |

Fine-grained `action` checks held for viewer and member on cases, runs, roles, webhooks, milestones, and own-project rename. Self role change (`PATCH /api/workspace` with own `userId` and `role: "admin"` or the admin `roleId`) was **403**. A `roleId` from another project was **404** `Role not found`.

---

## Confirmed bugs

### 1. PATCH and DELETE `/api/projects` authorize a different project than the one they mutate

`POST` select refuses a preferred id unless `access.ctx.project.id === parsed.data.id` (`src/app/api/projects/route.ts:73-80`). PATCH (`:145-160`) and DELETE (`:186-200`) do not. `requireProjectAccess` pins the preferred id only when the caller is already a member (`src/lib/project.ts:231-244`). Otherwise `pickAccessibleProject` (`:72-81`) returns the first accessible project, `project.manage` passes there, and `updateProject` / `deleteProject` (`:304-328`) run on the raw id. The only extra guard is “cannot delete the default project.”

Attacker was admin of `Test` only (confirmed `GET /api/projects` listed only that id).

- `PATCH /api/projects` `{"id":"3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf","name":"BUGHUNT-AUTHZ-HIJACK"}` → **200**. Demo's project list showed that name. Restored with the same body and `"name":"Topology"` → **200**.
- `PATCH /api/projects` `{"id":"<victim>","archived":true}` → **200** with `archivedAt` set. Victim was a project the attacker did not belong to.
- `DELETE /api/projects?id=<victim>` → **200** `{"ok":true}`. Project gone from `GET /api/projects?includeArchived=1`.
- `PATCH /api/projects` `{"id":"3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf","archived":true}` → **200** (default archived). Immediately unarchived as demo → **200** `archivedAt: null`.
- `DELETE /api/projects?id=3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf` → **400** `Cannot delete the default project`, not **403**. The membership check was skipped; only `deleteProject` refused.

### 2. Missing default membership is created as admin

`ensureMembership` inserts `role: admin` when the user has no row on the default workspace (`src/lib/workspace.ts:38-82`, default argument `"admin"`). `GET`/`POST`/`PATCH /api/workspace` call it before the action check (`src/app/api/workspace/route.ts:47`, `:121`, `:217`). The app shell does the same on every authenticated page (`src/app/(app)/layout.tsx:17`). `resolveActiveProject` does it again when the user has zero projects (`src/lib/project.ts:177-178`).

Attacker started as admin of `Test` only. After `GET /api/workspace` → **200** (body still described `Test`), Postgres showed a new `workspace_members` row on `default` with `role = admin` (created ~25s after the Test membership). A later `GET /api/projects` listed both, with `role: admin` on default. The row was removed before the project-IDOR probes, then recreated by another `GET /api/workspace`, then removed with the test user.

A viewer or member who only belongs to another project becomes admin of default by opening the app or calling `/api/workspace`.

### 3. Issue actions are not scoped to the caller's project

`POST /api/issues` requires `write: true` on the caller's project (`src/app/api/issues/route.ts:73-78`) and then calls `createIssueFromResult`, `refreshLinkedIssue`, `clearRetestFlag`, and `markIssueClosedLocally`, which load by result or issue id only (`src/lib/issues.ts:57-67`, `:179-183`, `:210-216`, `:223-239`). The same helpers are used by `POST /api/agent` after token auth, still without comparing the result's workspace to the token workspace (`src/app/api/agent/route.ts:293-318`).

Attacker admin of `Test` only (default membership removed):

- `POST /api/issues` `{"action":"mark_closed","issueId":"838d00c4-411e-40b7-9803-a851a6673d66"}` → **200**, `workspaceId` default, `remoteStatus: done`.
- `POST /api/issues` `{"action":"create","resultId":"09036a78-cb2b-4afd-9a12-67316af29f06","provider":"mock",...}` → **200**, new linked issue in default, `createdById` the Test-only user.
- `POST /api/issues` `{"action":"refresh","issueId":"838d00c4-411e-40b7-9803-a851a6673d66"}` → **200** on the same foreign issue.

Contrast: `GET /api/cases/<default-case-id>` and `POST /api/results/<default-result-id>/comments` with the default project header → **404**. Those handlers compare `workspaceId`.

### 4. Viewers receive webhook secrets and invite tokens

`GET /api/webhooks` requires a session and membership only (`src/app/api/webhooks/route.ts:10-30`) and returns the full row, including `secret`. `GET /api/workspace` likewise returns pending invites with `token` and `acceptUrl` (`src/app/api/workspace/route.ts:100-110`) with no `members.invite` check.

- Viewer `POST /api/webhooks` → **403** `Missing permission: webhooks.manage`.
- After an admin create, viewer `GET /api/webhooks` → **200**. Body included `secret` equal to the value the admin posted.
- Viewer `GET /api/workspace` → **200**. `invites` included a `token` field; several rows had `role: admin` (11 pending at the time of the probe, including the hunt invite).
- Accepting that token while signed in as the viewer → **403** email mismatch. The leak is the token, not a missing email check. Unauthenticated `GET /api/invites/<token>` → **200** preview (email, role, workspace name).

### 5. System Viewer actions can be edited and apply to every viewer immediately

`PATCH /api/roles` blocks renaming and archiving system roles (`src/app/api/roles/route.ts:176-193`) but applies `actions` anyway (`:198-200`). `membershipActions` prefers `customRole.actions` (`src/lib/project.ts:85-89`). The member enum is not updated for system roles (`src/app/api/roles/route.ts:216-219`), so the UI role stays `viewer` while the action list changes.

Admin `PATCH /api/roles` `{"id":"<default viewer system role>","actions":["cases.view","roles.manage","project.manage"]}` → **200**, `isSystem: true`. Viewer `GET /api/workspace` → **200**, `role: viewer`, `canAdmin: true`, `actions` included `roles.manage` and `project.manage`. Reverted to the stock viewer action list → **200**, `canAdmin: false`.

Only `roles.manage` can do this. It is still an authz hole: one edit elevates every holder of the shared Viewer role without changing the stored enum.

### 6. A custom role with only `members.invite` is stored as admin and can mint admin invites

`actionsAllowAdmin` is true if the set contains `members.invite`, `roles.manage`, or `project.manage` (`src/lib/permissions.ts:207-212`). `inferLegacyRole` then stores `admin` (`:219-224`). `ctxCanAdmin` / `ctxCanWrite` OR that legacy enum (`src/lib/project.ts:96-101`), so the flags are true even when `actions` is only `members.invite`.

- Admin `POST /api/roles` `{"name":"BUGHUNT-AUTHZ-inviter","actions":["members.invite"]}` → **201**.
- Admin `PATCH /api/workspace` assigning that `roleId` → **200** with `role: "admin"` and that `customRoleId`.
- That user `GET /api/workspace` → `role: admin`, `canAdmin: true`, `canWrite: true`, `actions: ["members.invite"]`.
- That user `POST /api/workspace` `{"email":"…escalated…","role":"admin"}` → **201**, invite `role: admin`.
- Same user `POST /api/cases` → **403** `cases.create`. `PATCH /api/projects` rename and `POST /api/roles` → **403**. Action checks still apply.

So a role that does not include case/project/role actions is persisted as admin, reports `canAdmin`/`canWrite`, and can issue admin invites. Routes that use `write: true` instead of an action (`/api/issues`, comments, attachments, views, CSV import) use `ctxCanWrite`, which was true for this membership. Those writes were not re-sent after the flag was observed. Membership and the custom role were restored/archived afterward.

Direct self-escalation without `roles.manage` did not work (`PATCH` own membership → **403**). A `roleId` from another workspace → **404**.

---

## Controls that held

- Unauthenticated `/api/cases`, `/api/settings`, `/api/roles`, `/api/workspace`, `/api/webhooks`, `/api/projects` → **307** `/login`. `/api/agent` and `/api/ci/runs` without a bearer token → **401**.
- Viewer `POST`/`PATCH`/`DELETE` cases, runs, roles, workspace invites, webhooks, and own-project rename → **403**.
- Member on those admin routes → **403**. Member case create → **201** (intended).
- `x-topology-project-id` of a project the caller does not belong to did not return that project's cases. Direct case, run, and activity ids in the other project → **404**. Comments on a foreign result → **404**.
- `GET /api/agent?resource=cases` with the demo token and the Test project header returned default-workspace cases, not Test.
- Member `DELETE /api/views/<other user's view>` → **404**. Viewer `GET /api/views` did not include that view.
- Invite accept requires the session email to match. 

---

## Residual state

Hunt users, the two hunt invites, the hunt webhook, the hunt saved view, the hunt case, and the linked issue created by the cross-workspace `create` were removed. Default project name is `Topology` and it is not archived. The victim project created for the delete probe was deleted by the IDOR itself. An archived custom role `BUGHUNT-AUTHZ-inviter` may remain. `needs_retest` on issue `838d00c4-411e-40b7-9803-a851a6673d66` was set back to `0` after `mark_closed`.

```json
[
  {
    "id": "AUTHZ-001",
    "severity": "critical",
    "title": "Project PATCH/DELETE mutates an id the caller does not belong to",
    "area": "projects",
    "file": "src/app/api/projects/route.ts",
    "repro_summary": "Admin of Test only: PATCH /api/projects {id: default, name} 200 and renamed it; PATCH archive on a foreign project 200; DELETE foreign project 200; DELETE default 400 from deleteProject, not 403."
  },
  {
    "id": "AUTHZ-002",
    "severity": "critical",
    "title": "Non-members of the default project are inserted as admin",
    "area": "workspace membership",
    "file": "src/lib/workspace.ts",
    "repro_summary": "User admin of Test only called GET /api/workspace 200; a default workspace_members row with role admin appeared. Layout and resolveActiveProject call the same helper."
  },
  {
    "id": "AUTHZ-003",
    "severity": "high",
    "title": "Issue create/refresh/close ignores workspace of the target id",
    "area": "issues",
    "file": "src/app/api/issues/route.ts",
    "repro_summary": "Admin of Test only: POST /api/issues mark_closed and refresh on a default issue id 200; create with a default resultId 200 and stored the issue in default."
  },
  {
    "id": "AUTHZ-004",
    "severity": "high",
    "title": "Viewers can read webhook secrets and admin invite tokens",
    "area": "webhooks and invites",
    "file": "src/app/api/webhooks/route.ts",
    "repro_summary": "Viewer POST /api/webhooks 403, GET /api/webhooks 200 with secret. Viewer GET /api/workspace 200 with invite.token on admin invites. Accept as the wrong email 403."
  },
  {
    "id": "AUTHZ-005",
    "severity": "high",
    "title": "Editing Viewer system-role actions elevates every viewer",
    "area": "roles",
    "file": "src/app/api/roles/route.ts",
    "repro_summary": "Admin PATCH /api/roles on the Viewer system role adding roles.manage and project.manage 200. Viewer GET /api/workspace then showed role viewer and canAdmin true. Reverted."
  },
  {
    "id": "AUTHZ-006",
    "severity": "high",
    "title": "members.invite-only custom role is stored as admin and can invite admins",
    "area": "roles",
    "file": "src/lib/permissions.ts",
    "repro_summary": "POST /api/roles actions [members.invite] 201, assign via PATCH /api/workspace 200 with role admin, me.canAdmin and canWrite true. That user POST /api/workspace role admin 201. cases.create still 403."
  }
]
```
