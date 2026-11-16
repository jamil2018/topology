# Topology 0.1.x release test plan

This is the release test plan for Topology **0.1.x**, the first public release. A human tester can execute every case below against a running instance. Automation pointers name the spec that is expected to cover the case. Run the case by hand when that file is not in the tree yet. Do not mark a case passed because the file is missing.

Version under test: `0.1.x` (root `package.json`, currently `0.1.0`). License and product shape are described in [README.md](../README.md). Self-host steps live in [docs/deploy.md](deploy.md). Import shapes live in [docs/import.md](import.md).

## 1. Purpose, scope, and exit criteria

### Purpose

Prove that a self-hosted Topology 0.1.x instance can be set up, signed into, and used as a test-case manager: cases, plans, runs, imports, CI ingest, triage, issues, reports, settings, and the opt-in quality graph. Prove that roles, API tokens, and project boundaries hold when the UI is bypassed. Prove the WCAG 2.2 AA bar on the Chromium desktop and the named viewports.

### In scope

- The Next.js app on `http://127.0.0.1:4317` (pages under `src/app`, including `(app)`, `login`, `setup`, `invite`, `share`, and `connect`).
- HTTP APIs under `src/app/api` (enumerated by method in `tasks/validation/inventory.json`).
- Workspace roles and the action catalog in `src/lib/permissions.ts`.
- API token scopes `read`, `ci-write`, and `agent`.
- CLI (`packages/cli`), MCP (`packages/mcp`), reporters (`@topology/playwright`, `@topology/jest`, `@topology/cypress`, pytest in `packages/pytest-topology`), issue providers (`@topology/issue-providers`), outbound webhooks, and S3-compatible attachments.
- Docker image, `docker-compose.prod.yml`, journaled migrations `0000_baseline` through `0006_report_share_generation`, backup and restore, and the performance budgets in [OPS](#8-ops-deploy-and-data).
- Comprehensive Chromium plus required Firefox/WebKit core journeys. Release evaluation includes responsive/accessibility, visual and scale checks. See [Environments](#2-environments-and-setup).

### Out of scope

- Hosted multi-tenant SaaS, billing, and a public demo reset.
- Helm. Production packaging under test is the container image and Compose file in [docs/deploy.md](deploy.md).
- Live calls to GitHub, Google, Jira, Linear, GitLab, or a real LLM. OAuth buttons are checked for visibility only. Issue providers other than `mock` are contract-tested with HTTP mocked.
- A full penetration test beyond the cases in [Security](#4-security) and the manual OWASP ZAP baseline.

### Release exit criteria

Ship 0.1.x only when all of the following are true:

1. Every **P0** case in this document has passed, either by its automation spec on Chromium or by a recorded manual execution. A missing spec is not a pass.
2. Every **P0** manual checklist in [Manual-only checklists](#manual-only-checklists) has a filled result (pass, or a written defect).
3. **P1** failures do not block the tag only when each failure has a written defect (id, severity, owner, and a one-line user impact). Silent skips, `test.fixme` without a defect, and "known red" are not waivers.
4. **P2** failures are recorded. They do not block the tag.
5. Missing security headers are a logged defect ([SEC-HEADERS-001](#sec-headers-001--security-headers-are-present)). Record that defect at release time. Do not treat a missing header as an untested gap or a skipped area, and do not describe the headers as already implemented. See [Defects](#6-defects-severity-and-security-header-policy).
6. `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test:unit`, `npm run test:integration`, and `npm run test:ui` are green on the same commit as the E2E run.
7. `npm audit --omit=dev` reports no high or critical advisories, or each advisory has a written defect and an accepted waiver ([SEC-DEPS-001](#sec-deps-001--production-dependency-audit)).

## 2. Environments and setup

Release validation uses Node 22, Python 3 + pytest, Docker Compose v2 and installed Playwright browsers. Run `npm ci` then `npx playwright install chromium firefox webkit`. The harness builds pinned upstream MinIO from source and needs network access on its first run.

```bash
npm run test:sanity
npm run test:regression
npm run test:release
```

The harness creates unique disposable PostgreSQL/MinIO services, distinct onboarding/seeded/migration/visual/Lighthouse/performance/restore databases, and temporary attachments. It migrates and seeds only its own databases and cleans them up after success or failure. Never reset the developer database. Browser gates run a production webpack build and the standalone server; `test:e2e:debug` explicitly selects development mode against a separately prepared disposable database.

See [commands and evidence](../tasks/validation/README.md). External-provider qualification is opt-in through `test:live`; manual screen-reader/native zoom checks remain unqualified until executed with the prerequisites listed below.

### E2E seed contract

A project is a workspace row. There is no workspace named "Other Workspace".

`TOPOLOGY_SEED_MODE=e2e` or `npm run db:seed:e2e` creates the people, projects, and tokens below, on top of the demo seed. Default `npm run db:seed` does not create these users. Passwords are at least 12 characters. **Harbor** is the primary demo project. Cases, runs, and the milestone "Harbor 2.4 checkout gate" from the demo seed are present on Harbor.

| Email | Password | Role and place |
| --- | --- | --- |
| `demo@topology.local` | `topology-demo` | Admin of Harbor. Also a member of **Harbor Beta** (slug `harbor-beta`). The membership stored on Harbor Beta is admin. |
| `member@topology.local` | `topology-member` | Member of Harbor only. Not a member of Harbor Beta. |
| `viewer@topology.local` | `topology-viewer` | Viewer of Harbor only. Not a member of Harbor Beta. |
| `custom@topology.local` | `topology-custom` | Harbor only. Custom role **E2E view cases and runs**. It is not a system role. Allow-list is only `cases.view` and `runs.view`. The coarse membership enum stored beside it is `viewer`. Not a member of Harbor Beta. |
| `other@topology.local` | `topology-other` | Only admin of **Foreign Project** (slug `foreign-project`, case key **FOR-1**). Not a member of Harbor or Harbor Beta. |

**Harbor Beta** (slug `harbor-beta`, case key **BETA-1**) is its own project. `demo@topology.local` can switch to it. `member@topology.local`, `viewer@topology.local`, and `custom@topology.local` cannot. **Foreign Project** is the cross-tenant project.

API tokens, owned by the demo admin on Harbor (fixed harness plaintext; the database stores the hash):

| Token | Scope | State |
| --- | --- | --- |
| `topo_e2e_read_token` | `read` | Active |
| `topo_e2e_ci_token` | `ci-write` | Active. `ci-write` satisfies a `read` check. It does not satisfy `agent`. |
| `topo_e2e_agent_token` | `agent` | Active. `agent` satisfies a `read` check. It does not satisfy `ci-write`. |
| `topo_e2e_revoked_token` | `read` | Revoked |

Send tokens as `Authorization: Bearer <token>`. Send the project as `x-topology-project-id: <project uuid>` when the route is project-scoped. There is no pre-seeded expired token. [RBAC-TOK-005](#rbac-tok-005--expired-token-is-401) expires a token the case creates.

The process environment variable `TOPOLOGY_API_TOKEN` is not a bearer credential when `NODE_ENV=production`. It is accepted only when Node is not in production **and** `TOPOLOGY_ALLOW_ENV_API_TOKEN=1`.

### Playwright projects

- `setup`: real login for admin/member/viewer/custom accounts.
- `chromium`: comprehensive seeded functional, security, UX and accessibility checks. This is `test:e2e`.
- `smoke`: the original smoke and release-gate selection, now `test:e2e:smoke`.
- `firefox-core`, `webkit-core`: critical execution and public-report journeys.
- `mobile-390`, `tablet-834`, `tablet-1194`, `laptop-1366`, `desktop-1920`: responsive/accessibility checks.
- `onboarding`: first-admin creation and login against an empty database.
- `performance`: measured 50k cases, 5k executor results, 10k-result ingest.
- `visual`: controlled light/dark primary screens, dialog and empty-state snapshots against a separate fixture database.
- `lighthouse`: authenticated production home, cases and run budgets.

Retries are disabled. Every selected required service must pass preflight. Artifacts include JSON/HTML results, redacted logs/traces, masked failure screenshots and browser diagnostics. The matrix records **not run** until assertion review and actual execution evidence are reconciled.

## 3. Priority scheme

| Priority | Meaning | Release rule |
| --- | --- | --- |
| P0 | Broken auth, data leak, lost test results, or a WCAG 2.2 AA failure on a primary journey. A missing security header is a logged P0 defect under [SEC-HEADERS-001](#sec-headers-001--security-headers-are-present), recorded at release time. | Must pass. |
| P1 | Important feature wrong or incomplete, with a workaround. | Must pass, or a written defect waives it. |
| P2 | Polish, visual baselines, scale benches, deep quality-graph edges. | Record only. |

Severity of a defect is separate from the case priority. A P2 case can still uncover an S0 vulnerability. Use the scale in [Defects](#6-defects-severity-and-security-header-policy).

## 4. Test cases

### Functional

Automation directory: `e2e/functional/`.

#### Auth and onboarding

### FN-AUTH-001 — First-run admin on /setup

- **Priority:** P0
- **Area:** Auth
- **Preconditions:** Database migrated and empty. No users. OAuth env vars empty. App at `http://127.0.0.1:4317`.
- **Steps:**
  1. Open `http://127.0.0.1:4317/`.
  2. On `/setup`, enter Name `Release Admin`, Email `admin-setup@topology.local`, Password `topology-setup-1`, Confirm password `topology-setup-1`.
  3. Click **Create admin**.
  4. Repeat with password `short`.
  5. After success, open `/setup` again.
- **Expected:** Step 1 redirects to `/setup` when no admin exists. Step 3 lands on `/` with a session. The page states the password must be at least 12 characters. `short` does not create a user. A second visit to `/setup` does not create another admin (`POST /api/setup` is refused).
- **Automation:** `e2e/functional/auth.spec.ts`

### FN-AUTH-002 — Email login and a wrong password

- **Priority:** P0
- **Area:** Auth
- **Preconditions:** E2E seed applied. OAuth unset, so the email form is visible without clicking **Use email instead**.
- **Steps:**
  1. Open `http://127.0.0.1:4317/login`.
  2. Sign in as `demo@topology.local` / `topology-demo` with **Sign in with email**.
  3. Sign out (sidebar **Sign out**).
  4. Sign in as `demo@topology.local` / `not-the-password`.
- **Expected:** Step 2 lands on `/` (Harbor hub). Step 4 stays on `/login`, shows an alert (`role="alert"`), and does not reveal whether the email exists. No session cookie for the failed attempt.
- **Automation:** `e2e/functional/auth.spec.ts`

### FN-AUTH-003 — Lockout after five failures, then the window resets

- **Priority:** P0
- **Area:** Auth
- **Preconditions:** Fresh rate-limit row for `demo@topology.local` from this client IP (delete the `login_rate_limits` row for `email:demo@topology.local|ip:<ip>` if a previous run locked it). Window is 15 minutes (`LOGIN_WINDOW_MS` / `LOGIN_LOCKOUT_MS`).
- **Steps:**
  1. From one IP, submit **Sign in with email** five times with password `wrong-password-1`.
  2. Immediately submit the correct password `topology-demo`.
  3. Clear the lockout row, or wait until `locked_until` is past, and sign in with `topology-demo`.
- **Expected:** The fifth failure locks that email+IP pair. Step 2 is rejected even with the right password and tells the user to wait (retry on the order of 900 seconds). Step 3 succeeds. A different IP is not locked by this email's counter. See also [SEC-RATE-001](#sec-rate-001--login-rate-limit-window).
- **Automation:** `e2e/functional/auth.spec.ts`

### FN-AUTH-004 — Logout and an expired session

- **Priority:** P0
- **Area:** Auth
- **Preconditions:** Signed in as admin.
- **Steps:**
  1. Click **Sign out**.
  2. Open `http://127.0.0.1:4317/cases` in the same browser profile.
  3. Sign in again. Delete or expire the session cookie, then open `/cases`.
  4. `GET /api/cases` with no cookie and no bearer token.
- **Expected:** Step 1 returns to `/login`. Step 2 and step 3 redirect to `/login` (callback path may be `/cases`). Step 4 is HTTP 401, not a case list. The session cookie is `HttpOnly` (see [SEC-SESS-001](#sec-sess-001--session-cookie-flags)).
- **Automation:** `e2e/functional/auth.spec.ts`

### FN-AUTH-005 — Accept an invite

- **Priority:** P0
- **Area:** Auth
- **Preconditions:** Admin signed in. Harbor project selected.
- **Steps:**
  1. Open **Settings → Access** (`/settings?section=access#members`).
  2. Invite `invitee@topology.local` as Member.
  3. In a private window, open the invite URL `/invite/<token>`.
  4. Sign in or create the email password for that address and accept.
- **Expected:** `GET /api/invites/<token>` describes the Harbor invite without requiring a session. After accept, `invitee@topology.local` can open `/cases` and sees Harbor cases. They cannot open **Settings → Access** invite controls (`members.invite` is admin-only).
- **Automation:** `e2e/functional/auth.spec.ts`

### FN-AUTH-006 — Expired and reused invite tokens

- **Priority:** P0
- **Area:** Auth
- **Preconditions:** Two unused invites created by the admin. One is expired in the database (`expires_at` in the past) before use.
- **Steps:**
  1. Open `/invite/<expired-token>` and submit accept (`POST /api/invites/<token>`).
  2. Accept a fresh invite once.
  3. Submit the same token again from a second browser.
- **Expected:** The expired token does not create a membership and does not sign the visitor into Harbor. The reused token does not add a second membership and does not upgrade the role. Neither response includes a session for a different user.
- **Automation:** `e2e/functional/auth.spec.ts`

### FN-AUTH-007 — OAuth buttons and air-gap copy

- **Priority:** P1
- **Area:** Auth
- **Preconditions:** Ability to restart the app with env changes. No need to complete an OAuth handshake.
- **Steps:**
  1. With `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID`, and `AUTH_GOOGLE_SECRET` unset, open `/login`.
  2. Set GitHub and Google ids/secrets, leave `TOPOLOGY_AIR_GAP` unset, restart, open `/login`.
  3. Set `TOPOLOGY_AIR_GAP=1` in addition to those ids, restart, open `/login`.
  4. Set `AUTH_OIDC_ISSUER`, `AUTH_OIDC_ID`, `AUTH_OIDC_SECRET`, and `AUTH_OIDC_NAME=Okta`, restart with air-gap off, open `/login`.
- **Expected:** Step 1 shows **Sign in with email** and does not show **Continue with GitHub** or **Continue with Google**. Step 2 shows those buttons and **Use email instead**; the support line is the identity-provider sentence. Step 3 hides the provider buttons and shows the copy "Air-gapped mode. Sign in with email and password for local operators." Step 4 shows **Continue with Okta**. Clicking a provider is out of scope; visibility is the assertion.
- **Automation:** `e2e/functional/auth.spec.ts`

### FN-AUTH-008 — callbackUrl stays on this origin

- **Priority:** P0
- **Area:** Auth
- **Preconditions:** Logged out.
- **Steps:**
  1. Open `/login?callbackUrl=/cases`.
  2. Sign in as admin.
  3. Repeat sign-in from `/login?callbackUrl=https://evil.example/phish`, `/login?callbackUrl=//evil.example/phish`, `/login?callbackUrl=/\evil`, and a `callbackUrl` containing CR or LF.
- **Expected:** Step 2 lands on `/cases`. Every hostile value lands on `/` after sign-in. The browser never navigates to `evil.example`. This is the same rule as `safeCallbackPath` in `src/lib/safe-callback-path.ts`. Hostile values are also covered as security cases in [SEC-REDIR-001](#sec-redir-001--login-callbackurl-open-redirect).
- **Automation:** `e2e/functional/auth.spec.ts`

#### Hub

### FN-HUB-001 — QA home widgets

- **Priority:** P0
- **Area:** Hub
- **Preconditions:** Signed in as admin. Harbor demo data present (milestone "Harbor 2.4 checkout gate", seeded cases and runs).
- **Steps:**
  1. Open `http://127.0.0.1:4317/`.
  2. Read the hub: quality pulse, milestone readiness, flake queue, retest queue.
  3. Open the notifications control (**Notifications**).
- **Expected:** The hub renders without an error boundary. Milestone copy uses Go, At risk, or No go (not color alone). Flake and retest regions are present even when a queue is empty. The notifications panel opens and can be closed with **Close notifications** or Escape.
- **Automation:** `e2e/functional/hub.spec.ts`

### FN-HUB-002 — Overview pulse via ?view=overview

- **Priority:** P1
- **Area:** Hub
- **Preconditions:** Signed in as admin.
- **Steps:**
  1. Open `http://127.0.0.1:4317/?view=overview`.
  2. Compare with `http://127.0.0.1:4317/`.
- **Expected:** `?view=overview` shows the quality pulse overview. It does not 404. Refresh keeps the query. A viewer session can open the same URL (`reports`/`milestones` view actions are allowed for viewer).
- **Automation:** `e2e/functional/hub.spec.ts`

### FN-HUB-003 — Milestone Go, At risk, and No go

- **Priority:** P0
- **Area:** Hub
- **Preconditions:** Admin. The seeded milestone "Harbor 2.4 checkout gate" uses pass rate 95, max open P0 failures 0, min executed 80, max open blockers 0.
- **Steps:**
  1. On `/`, record the readiness label for "Harbor 2.4 checkout gate".
  2. As admin, add a failed P0 result that violates `maxOpenP0Failures` (or lower the threshold in milestone settings until the gate fails).
  3. Reload `/`.
  4. Restore a passing executed set that meets every threshold.
- **Expected:** The label is one of **Go**, **At risk**, or **No go**, with text that does not depend on color. Crossing a threshold changes the label after reload. A viewer sees the same label and cannot edit the milestone (`milestones.manage` denied).
- **Automation:** `e2e/functional/hub.spec.ts`

### FN-HUB-004 — Flake and retest queues

- **Priority:** P1
- **Area:** Hub
- **Preconditions:** Admin. A result that has flaked (pass then fail, or the seeded flake signal) and a failed result linked to a mock issue that is marked done and still needs retest.
- **Steps:**
  1. Open `/`.
  2. Follow the flake queue entry into automation or the run.
  3. Follow the retest queue entry.
- **Expected:** Each queue links to a real run or case. Empty queues say they are empty rather than hiding the region. The retest entry matches the **Retest ready** state used on the run.
- **Automation:** `e2e/functional/hub.spec.ts`

### FN-HUB-005 — Guided first-run and empty states

- **Priority:** P1
- **Area:** Hub
- **Preconditions:** Admin on a brand-new project created in [FN-PROJ-002](#fn-proj-002--create-a-project) with no cases. Separately, a session with the project cookie cleared.
- **Steps:**
  1. Open `/` on the empty project.
  2. Open `/cases` and `/runs/new` on that project.
  3. Clear the current project so the app has no active project and open `/`.
- **Expected:** Step 1 shows the region **Guided first run** titled **Get started**, with steps **Create a case** (`/cases?new=1`), **Start a run** (`/runs/new`), **Import CI** (`/settings?section=integrations#ci`), and **File an issue** (`/triage`). Step 2 on cases includes "Create the first case, then start a run, import CI, and file issues from triage." `/runs/new` shows **Create a case first**. Step 3 shows heading **No project selected** and, for an admin, **Manage projects** linking to `/settings?section=projects`. A non-admin sees "Ask an admin to invite you." and no manage link. Harbor case titles are absent.
- **Automation:** `e2e/functional/hub.spec.ts`

### FN-HUB-006 — Notifications bell

- **Priority:** P1
- **Area:** Hub
- **Preconditions:** Admin. At least one notification row, or a second session that generates one (issue created, run completed).
- **Steps:**
  1. Click **Notifications** on the hub chrome.
  2. Mark an item read (`PATCH /api/notifications`).
  3. Close with **Close notifications**.
- **Expected:** The button name includes the unread count when it is non-zero (`Notifications, N unread`). After mark-read, the count drops without a full reload. The panel does not trap the page after close; focus returns to the bell.
- **Automation:** `e2e/functional/hub.spec.ts`

#### Projects

### FN-PROJ-001 — Project switcher

- **Priority:** P0
- **Area:** Projects
- **Preconditions:** Signed in as `demo@topology.local`. Harbor and **Harbor Beta** (slug `harbor-beta`, case **BETA-1**) are separate projects. The demo admin is a member of both. `member@`, `viewer@`, and `custom@` are not members of Harbor Beta. `other@` is not used in this case.
- **Steps:**
  1. Open the project switcher in the shell.
  2. Confirm **Harbor** and **Harbor Beta** are both listed.
  3. Select **Harbor Beta**.
  4. Open `/cases`.
  5. Select the original Harbor project again.
- **Expected:** The active project name changes in the shell. Harbor Beta's case list does not include Harbor demo case keys. Switching back restores them. `GET /api/projects` lists both. Foreign Project is not in this user's switcher.
- **Automation:** `e2e/functional/projects.spec.ts`

### FN-PROJ-002 — Create a project from Settings

- **Priority:** P0
- **Area:** Projects
- **Preconditions:** Admin.
- **Steps:**
  1. Open `/settings?section=projects`.
  2. Create a project named `Release <timestamp>`.
  3. Switch to it.
  4. Sign in as member and open the same settings page.
- **Expected:** The new project appears in the switcher and is empty (guided empty state, no Harbor cases). `POST /api/projects` as member returns 403 `Missing permission: project.manage`. Member does not see a working create-project control.
- **Automation:** `e2e/functional/projects.spec.ts`

### FN-PROJ-003 — Data isolation between projects

- **Priority:** P0
- **Area:** Projects
- **Preconditions:** Admin. A case `ISO-<timestamp>` created while Harbor is selected. A case `BETA-<timestamp>` created while Harbor Beta is selected.
- **Steps:**
  1. With Harbor selected, search cases for `BETA-<timestamp>`.
  2. `GET /api/cases/<beta-id>` with `x-topology-project-id` set to the Harbor project id.
  3. Repeat from Harbor Beta looking for `ISO-<timestamp>`.
- **Expected:** Each list shows only that project's case. The cross-project GET is 404 or 403 and the JSON does not include the other title. Runs, plans, and reports follow the same project cookie. Harbor and Harbor Beta are separate workspace rows. Cross-tenant isolation for **Foreign Project** (slug `foreign-project`, case **FOR-1**) is [RBAC-IDOR-002](#rbac-idor-002--cross-workspace-foreign-project).
- **Automation:** `e2e/functional/projects.spec.ts`

### FN-PROJ-004 — No-project empty state

- **Priority:** P1
- **Area:** Projects
- **Preconditions:** Admin session. Project cookie and `x-topology-project-id` removed (archive every project, or use a user with membership revoked).
- **Steps:**
  1. Open `/`, `/cases`, and `/runs`.
  2. Repeat as `viewer@topology.local` if that user can be left without a project.
- **Expected:** Heading **No project selected**. Admin sees **Manage projects**. Viewer sees the sentence ending in "Ask an admin to invite you." No case keys from Harbor or Harbor Beta are rendered.
- **Automation:** `e2e/functional/projects.spec.ts`

#### Cases

### FN-CASES-001 — Create, edit, and delete a case

- **Priority:** P0
- **Area:** Cases
- **Preconditions:** Admin on Harbor.
- **Steps:**
  1. Open `/cases`. Click **New case** (or open `/cases?new=1`).
  2. Set key `REL-<timestamp>`, title `Release case <timestamp>`, priority P1, status Ready. Save.
  3. Reopen the case. Change the title to `Release case edited <timestamp>`. Save.
  4. Click **Delete REL-\<timestamp\>**, then confirm **Delete case**.
- **Expected:** The case appears in the table after create. Edit persists after reload (`PATCH /api/cases/<id>`). Delete removes it from the list and `GET /api/cases/<id>` is 404. Viewer and custom sessions do not show **New case** as an enabled action; `POST /api/cases` is 403 for them.
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-002 — Folder tree create, rename, move, and delete

- **Priority:** P0
- **Area:** Cases
- **Preconditions:** Admin. `folders.manage` is allowed for admin and member, denied for viewer and custom.
- **Steps:**
  1. In the **Folders** nav, click **New folder**. Name it `RelParent-<timestamp>`.
  2. Use **New subfolder in RelParent-\<timestamp\>** and name it `RelChild-<timestamp>`.
  3. **Rename RelChild-\<timestamp\>** to `RelChildRenamed-<timestamp>`.
  4. Move the child to the root (or onto another folder) using the tree's move control.
  5. **Delete RelChildRenamed-\<timestamp\>** and confirm.
  6. As viewer, look for **New folder**.
- **Expected:** The tree shows parent then child, then the new name, then the new parent. `POST /api/folders`, `PATCH /api/folders/<id>`, and `DELETE /api/folders/<id>` match those steps. Viewer and custom get 403 `Missing permission: folders.manage` and no enabled create/rename/delete controls. Deleting a folder does not delete cases that were moved out first; deleting a non-empty folder either refuses or re-homes cases, and the UI says which.
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-003 — Structured steps editor

- **Priority:** P0
- **Area:** Cases
- **Preconditions:** Admin. Case from [FN-CASES-001](#fn-cases-001--create-edit-and-delete-a-case) still exists, or create another.
- **Steps:**
  1. Open the case editor.
  2. Add step 1 action `Open /login`, expected `Email form is visible`, data `demo user`.
  3. Add step 2 action `Submit a wrong password`.
  4. Remove step 2 with **Remove step 2**.
  5. Reload the case.
- **Expected:** Fields expose `Step 1 action`, `Step 1 expected`, and `Step 1 data`. After reload, step 1 remains and step 2 is gone. Steps are stored on the case (`case_steps`), not only in the flat steps text.
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-004 — Shared steps

- **Priority:** P1
- **Area:** Cases
- **Preconditions:** Admin.
- **Steps:**
  1. Create a shared step named `Shared login <timestamp>` (`POST /api/shared-steps`) with action `Sign in with email`.
  2. On a case, use **Insert shared step** and pick that shared step.
  3. Edit the shared step action to `Sign in with email (edited)` (`PATCH /api/shared-steps/<id>`).
  4. Reopen the case.
- **Expected:** The case references the shared step. The edited action is what the case shows (shared, not a stale copy), unless the UI explicitly snapshots at insert time — if it snapshots, the case still shows the original text and the shared-step library shows the edit. Document which behavior you observed only if it differs; the release requirement is that the inserted step is visible on the case and in a later run. `DELETE /api/shared-steps/<id>` removes it from the library.
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-005 — Custom fields

- **Priority:** P1
- **Area:** Cases
- **Preconditions:** Admin. `project.manage` can define fields under **Settings → Projects** (`/settings?section=projects#fields`).
- **Steps:**
  1. Create a custom field `Component` (text) via the fields anchor or `POST /api/custom-fields`.
  2. On a case, set Component to `checkout`.
  3. Reload the case and the cases table.
  4. `PATCH /api/custom-fields/<id>` to rename the label. `DELETE` it afterward on a throwaway field.
- **Expected:** The value `checkout` persists on the case. The column or field label updates after rename. Member, who lacks `project.manage`, cannot create a field (403) but can edit case values if `cases.edit` is allowed. Viewer cannot edit the value.
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-006 — Version history, diff, and restore

- **Priority:** P0
- **Area:** Cases
- **Preconditions:** Admin. A case saved at least twice with different titles.
- **Steps:**
  1. Open the case history/versions panel (`GET /api/cases/<id>/versions`).
  2. Open a previous version (`GET /api/cases/<id>/versions/<versionId>`) and read the diff against the current title.
  3. Restore that version (`POST /api/cases/<id>/versions/<versionId>`).
  4. Reload the case.
- **Expected:** At least two versions are listed with actor and time. The diff shows the title change. After restore, the case title matches the chosen version and a new version row records the restore. Viewer can read history if the GET is allowed with `cases.view`; restore as viewer is 403 (`cases.edit`).
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-007 — Activity feed

- **Priority:** P1
- **Area:** Cases
- **Preconditions:** Admin. Case just created and edited.
- **Steps:**
  1. Open the case activity feed (`GET /api/cases/<id>/activity`).
  2. Edit the priority and reload the feed.
- **Expected:** Create and edit events appear in order, with the actor email or name. The feed is not the same list as version snapshots; both exist. An empty new case still has a create event.
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-008 — Search and filters

- **Priority:** P0
- **Area:** Cases
- **Preconditions:** Admin. Seeded Harbor cases plus `REL-<timestamp>` titled `Release case edited <timestamp>` if [FN-CASES-001](#fn-cases-001--create-edit-and-delete-a-case) deleted it, recreate a case with a unique token `zzfindme`.
- **Steps:**
  1. Focus **Search cases** and type `zzfindme`.
  2. Clear search. Apply a priority filter P0 and a status filter.
  3. `GET /api/search?q=zzfindme` with the session cookie.
- **Expected:** The table narrows to the matching case. Filters combine with search. The search API returns that case and does not return Harbor Beta or Foreign Project rows. Query language is the next case, not this box.
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-009 — Query language

- **Priority:** P1
- **Area:** Cases
- **Preconditions:** Admin session, and separately bearer `topo_e2e_read_token`. Quality graph seeded (demo seed inserts intents and requirements).
- **Steps:**
  1. `POST /api/query` with body `{ "dsl": "requirements where key in (\"REQ-1\", \"REQ-2\") order by key desc" }`.
  2. `POST /api/query` with `{ "dsl": "executions where status = failed and branch = main" }`.
  3. From the CLI, `npm run topology -- query 'intents where component = payments and criticality = P0'` using `TOPOLOGY_API_TOKEN=topo_e2e_read_token` and `TOPOLOGY_URL=http://127.0.0.1:4317`.
- **Expected:** Each call returns JSON rows, not a SQL error. Unknown entity or syntax returns 400 with a message, not 500. Values are parameterized (a quote in a literal does not change the query shape; injection is [SEC-INJ-001](#sec-inj-001--query-language-injection)). The read token is accepted on this route without a browser session. A redirect to `/login` is a failure.
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-010 — Saved views

- **Priority:** P1
- **Area:** Cases
- **Preconditions:** Admin.
- **Steps:**
  1. Filter cases to priority P0.
  2. Save the view as `P0 only <timestamp>` (`POST /api/views`).
  3. Clear filters, then reapply the saved view.
  4. Delete it (`DELETE /api/views/<id>`).
- **Expected:** The view survives reload and restores the P0 filter. After delete it is gone from the list and from `GET /api/views`. Viewer (`cases.view` only) can apply an existing view if the GET is allowed, and cannot create one if create requires `cases.edit` — record the actual status; a 403 must cite the missing action and the UI must not leave a saved view that the server rejected.
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-011 — Bulk edit and bulk delete

- **Priority:** P0
- **Area:** Cases
- **Preconditions:** Admin. Three cases `BULK-A-<timestamp>`, `BULK-B-<timestamp>`, `BULK-C-<timestamp>`.
- **Steps:**
  1. Select the three rows (**Select BULK-A-\<timestamp\>** or press `X` on a focused row).
  2. Bulk-set priority to P2 (bulk bar, `PATCH /api/cases` with the ids).
  3. Bulk-delete `BULK-B` and `BULK-C`, confirming the destructive control.
  4. As viewer, select a row and attempt the same PATCH.
- **Expected:** All three show P2 after step 2. Two are gone after step 3; `BULK-A` remains at P2. Viewer PATCH is 403 and the bulk bar is hidden or disabled. A partial failure rolls the optimistic UI back ([UX-OPT-001](#ux-opt-001--optimistic-update-rolls-back-on-500)).
- **Automation:** `e2e/functional/cases.spec.ts`

### FN-CASES-012 — Pagination, virtual list, CSV export, and template

- **Priority:** P1
- **Area:** Cases
- **Preconditions:** For pagination, run `npm run db:seed:stress` against a disposable database, or scroll a project that already has more than one page (`MAX_LIST_LIMIT` is 100). Admin session. CSV checks can use the normal E2E seed.
- **Steps:**
  1. Open `/cases`. Scroll the table until the next page loads.
  2. Open the **CSV actions** menu. Click **Download template**.
  3. Click **Export CSV**.
  4. Open the CSV in a text editor.
- **Expected:** The list virtualizes or pages: the first response is not the entire stress set in one payload (`GET /api/cases` honors the limit, max 100). Scrolling shows further keys. **Download template** hits `GET /api/import/csv/template` and returns a CSV header row. **Export CSV** downloads the current project's cases, including keys, and does not include Harbor Beta or Foreign Project. Formula injection is [SEC-CSV-001](#sec-csv-001--csv-formula-injection-in-exports).
- **Automation:** `e2e/functional/cases.spec.ts`

#### Import

Import page: `/cases/import`. Buttons: **Preview mapping**, **Dry run**, **Import cases**. Both preview and run require `cases.create`. Existing keys in the project are skipped. Folder paths such as `Auth / Recovery` become one folder name.

### FN-IMP-001 — Native CSV import

- **Priority:** P0
- **Area:** Import
- **Preconditions:** Admin on an empty throwaway project (so seeded keys do not collide).
- **Steps:**
  1. Open `/cases/import`.
  2. Upload `fixtures/sample-cases.csv` through the CSV path (or `POST /api/import/csv`).
  3. Open `/cases`.
- **Expected:** Cases from the fixture exist with titles from the file. A second import of the same file skips existing keys and does not duplicate them. Viewer `POST /api/import/csv` is 403.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-002 — TestRail XML

- **Priority:** P0
- **Area:** Import
- **Preconditions:** Admin. Throwaway project.
- **Steps:**
  1. On `/cases/import`, choose TestRail and upload `fixtures/import/testrail.xml`.
  2. Click **Preview mapping**.
  3. Click **Dry run**, then **Import cases**.
- **Expected:** Preview returns source fields, a suggested mapping, counts, and up to five sample rows, and writes nothing. Dry run reports `wouldCreate` and does not change `GET /api/cases`. Import creates cases. TestRail numeric ids become keys like `C1`. Nested sections become a folder name with `Parent / Child`. `custom/preconds` and steps land in preconditions and steps.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-003 — TestRail CSV

- **Priority:** P1
- **Area:** Import
- **Preconditions:** Admin. Throwaway project.
- **Steps:**
  1. Upload `fixtures/import/testrail.csv`.
  2. Preview, dry run, import.
- **Expected:** Columns such as Title, Section Hierarchy, Preconditions, Steps, and Priority map onto Topology fields. Priority words (Critical, High, Medium, Low) become P0–P3. Import count matches the dry-run `wouldCreate` minus skips.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-004 — TestRail API JSON

- **Priority:** P1
- **Area:** Import
- **Preconditions:** Admin. Throwaway project. Do not call a live TestRail host.
- **Steps:**
  1. Upload `fixtures/import/testrail-api.json` with provider `testrail`.
  2. Preview and import.
- **Expected:** The `{ cases, sections }` (or raw cases) shape imports. `custom_preconds`, `custom_steps_separated`, `priority_id`, and `section_id` are honored. No outbound HTTP call is made for a file upload.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-005 — Qase CSV

- **Priority:** P1
- **Area:** Import
- **Preconditions:** Admin. Throwaway project.
- **Steps:**
  1. Upload `fixtures/import/qase.csv` with provider Qase.
  2. Preview, dry run, import.
- **Expected:** `id`, `title`, `suite`, `tags`, and `steps` map. Tags split on `;` or `,`. Suite becomes a folder. Keys look like `QS-n` when the source id is blank.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-006 — Qase JSON

- **Priority:** P1
- **Area:** Import
- **Preconditions:** Admin. Throwaway project.
- **Steps:**
  1. Upload `fixtures/import/qase.json`.
  2. Preview and import.
- **Expected:** `{ result: { entities } }` imports. Numeric priority and status map onto Topology priority and status (`draft`, `ready`, `blocked`, `deprecated`).
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-007 — Zephyr Scale CSV

- **Priority:** P1
- **Area:** Import
- **Preconditions:** Admin. Throwaway project.
- **Steps:**
  1. Upload `fixtures/import/zephyr.csv`.
  2. Preview and import.
- **Expected:** Repeated `Key`/`Name` rows collapse into one case. Step and expected-result columns become numbered steps. Keys look like `ZE-n` when blank.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-008 — Zephyr Scale JSON

- **Priority:** P1
- **Area:** Import
- **Preconditions:** Admin. Throwaway project.
- **Steps:**
  1. Upload `fixtures/import/zephyr.json`.
  2. Preview and import.
- **Expected:** `{ values: [ { key, name, folder, priority, testScript.steps } ] }` imports one case per value, with folder and steps filled.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-009 — Xray CSV and JSON

- **Priority:** P1
- **Area:** Import
- **Preconditions:** Admin. Two throwaway projects, or import sequentially and accept key skips on the second if keys overlap. Xray has no API pull.
- **Steps:**
  1. Upload `fixtures/import/xray.csv`. Preview and import.
  2. On a clean project, upload `fixtures/import/xray.json`. Preview and import.
  3. Confirm the provider form has no Xray API base-URL submit that calls the network.
- **Expected:** CSV rows that share an Issue Key become one case; Action, Data, and Expected Result become numbered steps. JSON `{ tests: [...] }` or Jira `{ issues: [...] }` imports. Keys look like `XR-n` when blank. There is no live Xray/Jira fetch.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-010 — Adjust mapping, dry run, then commit

- **Priority:** P0
- **Area:** Import
- **Preconditions:** Admin. Throwaway project. `fixtures/import/testrail.csv` available.
- **Steps:**
  1. Preview the file.
  2. Change the title mapping to a wrong column, then back to the suggested title column.
  3. Click **Dry run**. `GET /api/cases` and note the count.
  4. Click **Import cases**.
  5. Import the same file again.
- **Expected:** Preview and dry run do not insert rows (`wouldCreate` shown, case count unchanged). Commit inserts `created` rows and lists skipped keys. The second commit skips existing keys (`skipped` greater than zero, `created` zero for those keys). Duplicate keys inside one file are skipped after the first row. `POST /api/import/preview` and `POST /api/import/run` with `dryRun: true` then `dryRun: false` match the buttons.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-011 — Malformed files

- **Priority:** P0
- **Area:** Import
- **Preconditions:** Admin.
- **Steps:**
  1. Upload a `.xml` file that is not XML (`this is not xml`) as TestRail.
  2. Upload a CSV with no title column and refuse the mapping.
  3. Upload an empty file.
  4. `POST /api/import/preview` with `provider: "not-a-provider"`.
- **Expected:** Each attempt shows an error on the import page (or `cases/import/error.tsx` with **Try again** if the page crashes — a crash is a failure). No partial cases are inserted. HTTP status is 400, not 500. The project case count is unchanged.
- **Automation:** `e2e/functional/import.spec.ts`

### FN-IMP-012 — Vendor API URL is not stored and private hosts are refused

- **Priority:** P0
- **Area:** Import
- **Preconditions:** Admin. This overlaps SSRF; the functional bar is "no credential persistence and no loopback fetch."
- **Steps:**
  1. On TestRail API mode, submit base URL `http://127.0.0.1:9`, email `qa@example.com`, token `secret-token`, project `1` (`POST /api/import/preview` with an `api` object).
  2. Repeat with `http://169.254.169.254/`.
  3. Reload `/cases/import` and search the page source and `GET /api/settings` for `secret-token`.
- **Expected:** Both URLs are rejected before a connection (same SSRF rules as outbound webhooks). The token is not stored and does not appear in settings, audit metadata, or the client bundle. Redirects are not followed. Detailed SSRF cases: [SEC-SSRF-002](#sec-ssrf-002--import-and-ai-base-urls-block-private-hosts).
- **Automation:** `e2e/functional/import.spec.ts`

#### Plans

### FN-PLAN-001 — Create a plan with a configuration matrix

- **Priority:** P0
- **Area:** Plans
- **Preconditions:** Admin. At least two cases in Harbor.
- **Steps:**
  1. Open `/plans`.
  2. Create a plan named `Plan <timestamp>` (**Plan name**, **Description**).
  3. Add a configuration matrix (browser and OS, or the matrix controls the form exposes) with two combinations, for example Chrome/macOS and Firefox/Linux. Firefox here is a configuration label, not a browser under test.
  4. Select the two cases (**Search cases** on the plan if needed).
  5. Save and open `/plans/<id>`.
- **Expected:** `POST /api/plans` returns the plan. Detail shows the name, both cases, and both matrix rows. Member can create (`runs`/`cases` write plus the plan routes as implemented). Viewer `POST /api/plans` is 403. Plans stay in the default nav even when the quality graph is off.
- **Automation:** `e2e/functional/plans.spec.ts`

### FN-PLAN-002 — Launch a plan into runs

- **Priority:** P0
- **Area:** Plans
- **Preconditions:** Plan from [FN-PLAN-001](#fn-plan-001--create-a-plan-with-a-configuration-matrix).
- **Steps:**
  1. On the plan detail page, launch (`POST /api/plans/<id>/launch`).
  2. Open `/runs`.
- **Expected:** One run per matrix combination (or one run that carries the matrix, matching the product). Each run contains the selected cases. Run names identify the plan. Launching again creates a new run and does not delete the previous one.
- **Automation:** `e2e/functional/plans.spec.ts`

### FN-PLAN-003 — Plan detail and case search

- **Priority:** P1
- **Area:** Plans
- **Preconditions:** Admin. Plan with cases.
- **Steps:**
  1. Open `/plans/<id>`.
  2. Use **Search cases** to filter the plan's cases.
  3. `PATCH /api/plans/<id>` to rename the plan. `GET /api/plans/<id>` as viewer.
- **Expected:** Search narrows the list. Rename persists. Viewer GET succeeds (`runs.view` or the view action the route requires — if the route requires a write action, that is a defect, because viewers should read plans). Viewer PATCH is 403.
- **Automation:** `e2e/functional/plans.spec.ts`

#### Runs

### FN-RUN-001 — Start a run from case-picker filters

- **Priority:** P0
- **Area:** Runs
- **Preconditions:** Admin. Harbor has seeded cases in more than one folder.
- **Steps:**
  1. Open `/runs/new`.
  2. Filter the picker (folder or priority) so only a subset is selected.
  3. Name the run `Run <timestamp>` and start it.
  4. Open `/runs/<id>`.
- **Expected:** The run contains only the filtered cases. `POST /api/runs` persists it. It appears on `/runs`. Viewer does not get an enabled start control; `POST /api/runs` is 403 `Missing permission: runs.create`.
- **Automation:** `e2e/functional/runs.spec.ts`

### FN-RUN-002 — Pass, fail, blocked, skipped, per-step results, and auto-advance

- **Priority:** P0
- **Area:** Runs
- **Preconditions:** Admin. An in-progress run whose cases have structured steps (create one case with two steps and include it).
- **Steps:**
  1. Open `/runs/<id>`.
  2. On the focused case, click **Mark \<key\> as passed** (label **Passed**), then **Failed**, **Blocked**, and **Skipped** on subsequent cases. Keyboard: `P`, `F`, `B`, `S` with focus outside any input.
  3. On the stepped case, set step 1 with **Mark step 1 of \<key\> as passed** and step 2 as failed.
  4. Record a status on a case that is not the last untested case.
- **Expected:** Each result status persists after reload (`PATCH` on the run). The step buttons are independent of the case rollup. After a recorded status, focus moves to the next untested case (auto-advance) without a click. Shortcuts do nothing when the notes field is focused ([UX-SHORT-005](#ux-short-005--executor-shortcuts-and-inputs)).
- **Automation:** `e2e/functional/runs.spec.ts`

### FN-RUN-003 — Assign the run and a result

- **Priority:** P1
- **Area:** Runs
- **Preconditions:** Admin. Member `member@topology.local` exists. Run in progress.
- **Steps:**
  1. Assign the run to Member (run-level assignee control).
  2. Focus a result and press `A` (**Focus assignee**) or use the result assignee control. Choose Member.
  3. Sign in as member and open the run. Use the **Mine** filter (`aria-label="Mine"`).
- **Expected:** The result shows the member's name instead of **Unassigned**. **Mine** shows that result for the member and hides results assigned to someone else. Viewer cannot change the assignee (`runs.edit` denied).
- **Automation:** `e2e/functional/runs.spec.ts`

### FN-RUN-004 — Notes and comments

- **Priority:** P0
- **Area:** Runs
- **Preconditions:** Admin. In-progress run.
- **Steps:**
  1. Enter notes `Failed on checkout <timestamp>` on a result and blur the field.
  2. Enter a comment `Looks like a locator flake` and submit it (`POST /api/results/<id>/comments`).
  3. Reload `/runs/<id>`.
- **Expected:** Notes and the comment are both present. `GET /api/results/<id>/comments` returns the comment with the author. Viewer can read and cannot post (403).
- **Automation:** `e2e/functional/runs.spec.ts`

### FN-RUN-005 — Attachment upload and download within limits

- **Priority:** P0
- **Area:** Runs
- **Preconditions:** Admin. `ATTACHMENTS_DRIVER=local`. A PNG smaller than 10 MB (`src/lib/attachments.ts` `MAX_BYTES`).
- **Steps:**
  1. On a result, upload the PNG (`POST /api/results/<id>/attachments`).
  2. Download it (`GET /api/attachments/<id>`).
  3. Upload an 11 MB file.
- **Expected:** The PNG downloads with the same bytes. The response is `Content-Disposition: attachment` (asserted fully in [SEC-ATT-003](#sec-att-003--content-type-and-content-disposition)). The 11 MB upload is rejected with a message that the file exceeds 10 MB, and no row is stored. Path and HTML disguise checks are security cases, not this one.
- **Automation:** `e2e/functional/runs.spec.ts`

### FN-RUN-006 — Complete a run and keep it immutable

- **Priority:** P0
- **Area:** Runs
- **Preconditions:** Admin. Run with every result set to Passed, Failed, Blocked, or Skipped (no Untested), or the complete control allows completion with untested results — follow the button's enabled state.
- **Steps:**
  1. Click **Complete run**.
  2. After the button shows **Completing…** and finishes, try to change a result to Failed in the UI.
  3. `PATCH` the run or result API to change a status, as admin, with the session cookie.
- **Expected:** The run status is completed. The UI states that results cannot be edited and the status buttons are disabled (`frozen`). The status PATCH is rejected (409 or 403). The copy on the executor says results cannot be edited. Comments and attachments are still allowed on a completed run (the executor says so). Member can complete (`runs.complete`). Viewer cannot (`POST`/complete is 403).
- **Automation:** `e2e/functional/runs.spec.ts`

### FN-RUN-007 — Retest flow

- **Priority:** P1
- **Area:** Runs
- **Preconditions:** A completed run with a failed result, or the product's retest action on `/runs/<id>`.
- **Steps:**
  1. Start a retest from the failed result or the hub retest queue.
  2. Open the new run.
  3. Mark the previously failed case Passed.
- **Expected:** A new run (or a new iteration) is created. The original completed run stays frozen and still shows Failed. The new run accepts the pass. The hub retest queue drops the item once the product considers it retested.
- **Automation:** `e2e/functional/runs.spec.ts`

### FN-RUN-008 — Delete a run

- **Priority:** P1
- **Area:** Runs
- **Preconditions:** Admin. A run that is safe to delete (`Run <timestamp>`).
- **Steps:**
  1. Delete the run from `/runs` or the run page (the PATCH/delete path that requires `runs.delete`).
  2. Repeat the API call as member (allowed) and as viewer (denied).
- **Expected:** The run disappears from `/runs` and `GET /api/runs/<id>` is 404. Viewer receives 403 `Missing permission: runs.delete`. Deleting a run does not delete the cases.
- **Automation:** `e2e/functional/runs.spec.ts`

#### Issues

### FN-ISS-001 — Create a mock issue from a failed result

- **Priority:** P0
- **Area:** Issues
- **Preconditions:** Admin. `TOPOLOGY_ISSUE_PROVIDER=mock`. A failed or blocked result on an in-progress run.
- **Steps:**
  1. On the result, click **Create issue**.
  2. Reload the run.
  3. `GET /api/issues` and find the new row.
- **Expected:** An issue appears with provider `mock` and a remote key. The button is only available when status is failed or blocked and the run is not frozen. No outbound network call. The click sends `{ action: "create", resultId, provider: "mock" }` to `POST /api/issues`.
- **Automation:** `e2e/functional/issues.spec.ts`

### FN-ISS-002 — Link an existing issue

- **Priority:** P0
- **Area:** Issues
- **Preconditions:** Admin. Failed result. A known mock key, or type `MOCK-<timestamp>` if the mock provider accepts new keys on link.
- **Steps:**
  1. In **Link key (MOCK-1)**, enter `MOCK-42`.
  2. Click **Link**.
  3. Click **Sync**.
- **Expected:** The issue row shows `MOCK-42` and a status. Link posts `{ action: "link", resultId, remoteKey, provider: "mock" }`. Sync refreshes status. An empty key leaves **Link** disabled.
- **Automation:** `e2e/functional/issues.spec.ts`

### FN-ISS-003 — A passing retest transitions the issue

- **Priority:** P1
- **Area:** Issues
- **Preconditions:** Failed result linked to a mock issue. Ability to record a later passing result for the same case (retest run).
- **Steps:**
  1. Note the issue status.
  2. On a later run, mark the same case Passed.
  3. Reload the original issue row. Also try **Mark closed** while the provider is mock.
- **Expected:** The passing result calls the provider `transition` toward done (`syncIssuesOnPassingRetest`). The UI shows the closed/done status, or **Retest ready** when `needsRetest` is set and status is done. If the remote transition fails, the local close still applies so the retest queue can move. **Mark closed** sets the local status without requiring the provider. Viewer cannot create or link (403).
- **Automation:** `e2e/functional/issues.spec.ts`

#### Triage

### FN-TRI-001 — Failure signatures group

- **Priority:** P0
- **Area:** Triage
- **Preconditions:** Admin. At least two failed results that share a failure message (ingest `fixtures/junit/smoke.xml` twice, or fail two cases with the same note). `TOPOLOGY_ISSUE_PROVIDER=mock`.
- **Steps:**
  1. Open `/triage`.
  2. Find the group for that signature.
- **Expected:** Failures with the same signature are one group, with a count greater than 1. Opening the group shows the underlying results. `GET /api/triage` returns the same grouping. Viewer can open `/triage` for reading; mutating it is [FN-TRI-002](#fn-tri-002--triage-bulk-actions).
- **Automation:** `e2e/functional/triage.spec.ts`

### FN-TRI-002 — Bulk actions

- **Priority:** P1
- **Area:** Triage
- **Preconditions:** Admin and, separately, viewer. A signature group with multiple failures.
- **Steps:**
  1. As admin, select the group and run the bulk action the page offers (link an issue, or mark the group).
  2. `PATCH /api/triage` as viewer with the same body.
- **Expected:** Admin's action applies to each result in the group and survives reload. Viewer PATCH is 403 `Missing permission: triage.manage`. The viewer UI hides or disables the bulk control.
- **Automation:** `e2e/functional/triage.spec.ts`

### FN-TRI-003 — Triage live update

- **Priority:** P1
- **Area:** Triage
- **Preconditions:** Two browser contexts, both admin (or admin and member). `/triage` open in context B.
- **Steps:**
  1. In context A, fail a new result with a distinctive message `triage-live-<timestamp>`.
  2. Watch context B without reloading.
- **Expected:** The new signature appears in context B through `/api/live` (SSE). A full document reload is not required. If the socket drops, [UX-NET-003](#ux-net-003--sse-reconnects-after-a-dropped-connection) covers reconnect. Viewer context B sees the update if they can read triage.
- **Automation:** `e2e/functional/triage.spec.ts`

#### Automation and CI

### FN-AUTO-001 — JUnit ingest from the automation browser

- **Priority:** P0
- **Area:** Automation
- **Preconditions:** Admin. `fixtures/junit/smoke.xml` on disk. Token `topo_e2e_ci_token` for the API path.
- **Steps:**
  1. `POST /api/ci/junit` with bearer `topo_e2e_ci_token`, `x-topology-project-id` of Harbor, and the parsed smoke file (or `npm run topology -- junit submit ./fixtures/junit/smoke.xml --source cli` with `TOPOLOGY_API_TOKEN=topo_e2e_ci_token`).
  2. Open `/automation`.
- **Expected:** A run or automation row appears for the smoke suite. Passed and failed counts match the file. `topo_e2e_read_token` receives 403 on this POST (`ci-write` required). The read token can `GET /api/ci/runs`.
- **Automation:** `e2e/functional/automation.spec.ts`

### FN-AUTO-002 — False-green JUnit

- **Priority:** P0
- **Area:** Automation
- **Preconditions:** Admin. `fixtures/junit/false-green.xml`.
- **Steps:**
  1. Submit `fixtures/junit/false-green.xml` the same way as smoke.
  2. Open the ingested run in `/automation` and in `/runs/<id>`.
- **Expected:** The file is not stored as a clean pass. Failures that the fixture marks false-green (passing testcase with a failure child, or the fixture's actual shape) show as failed in Topology. The summary counts match that interpretation. A green badge on a failed testcase is a P0 defect.
- **Automation:** `e2e/functional/automation.spec.ts`

### FN-AUTO-003 — Shard merge

- **Priority:** P1
- **Area:** Automation
- **Preconditions:** `topo_e2e_ci_token`. Two different JUnit files (smoke and a one-off copy with a different test name).
- **Steps:**
  1. `POST /api/ci/runs` with `{ "name": "shards-<timestamp>", "source": "cli", "shardTotal": 2 }`.
  2. `POST /api/ci/runs/<id>/shards` for shard 0 and shard 1 with different results (or `topology runs submit-thread`).
  3. `POST /api/ci/runs/<id>/complete`.
  4. Locally, `topology junit merge-local` on the two files and compare names.
- **Expected:** The server run contains both shards' cases. A later shard overwrites the same test name (same rule as `merge-local`). Complete marks the CI run done. Read token cannot post shards (403).
- **Automation:** `e2e/functional/automation.spec.ts`

### FN-AUTO-004 — Flake signals

- **Priority:** P1
- **Area:** Automation
- **Preconditions:** Admin. The same automated test name ingested once as failed and once as passed (or the seeded flake).
- **Steps:**
  1. Open `/automation`.
  2. Open `GET /api/flake`.
  3. Compare with the hub flake queue.
- **Expected:** The test is flagged as a flake. The hub queue and `/automation` agree on the name. A test that only passed is not flagged.
- **Automation:** `e2e/functional/automation.spec.ts`

#### Reports and milestones

### FN-REP-001 — Report dashboard charts

- **Priority:** P0
- **Area:** Reports
- **Preconditions:** Admin. A completed run with mixed statuses (the demo seed's completed runs qualify).
- **Steps:**
  1. Open `/reports`.
  2. Open `/reports/<run id>`.
- **Expected:** The list links to the run. The detail page shows pass/fail (and blocked/skipped) charts or totals that match the run's results. Viewer can open it (`reports.view`). Custom role cannot (`reports.view` denied): the page does not show Harbor totals, and the export API is 403.
- **Automation:** `e2e/functional/reports.spec.ts`

### FN-REP-002 — Export CSV, XLSX, and PDF

- **Priority:** P0
- **Area:** Reports
- **Preconditions:** Admin. Known run id. Export route accepts `format=csv|xlsx|pdf` only (`GET /api/reports/<id>/export`).
- **Steps:**
  1. Download `?format=csv`, `?format=xlsx`, and `?format=pdf`.
  2. Request `?format=json`.
  3. Open the CSV and confirm a failed case key is present.
- **Expected:** CSV is text with a header and one row per result. XLSX is a zip workbook. PDF begins with `%PDF`. `format=json` is 400 `format must be csv, xlsx, or pdf`. There is no JSON report export. Each successful export writes an audit event `export.report`. Viewer can export (`reports.view`). A user without `reports.view` cannot.
- **Automation:** `e2e/functional/reports.spec.ts`

### FN-REP-003 — Unauthenticated share link

- **Priority:** P0
- **Area:** Reports
- **Preconditions:** Admin creates a share (`POST /api/reports/<id>/share`) and copies `/share/reports/<token>`.
- **Steps:**
  1. In a private window with no cookies, open `http://127.0.0.1:4317/share/reports/<token>`.
  2. `GET /api/share/reports/<token>/export?format=csv` with no cookie.
  3. Open `/share/reports/not-a-real-token`.
- **Expected:** The valid token renders the report without a login redirect. The CSV downloads. A missing token is 404 and does not fall through to another run's data. If middleware redirects `/share` to `/login`, that is a failure of this case, not an allowed skip: share links are public by token.
- **Automation:** `e2e/functional/reports.spec.ts`

### FN-REP-004 — Revoked share link

- **Priority:** P0
- **Area:** Reports
- **Preconditions:** A share token from [FN-REP-003](#fn-rep-003--unauthenticated-share-link).
- **Steps:**
  1. Select **Revoke all share links** in the report UI, or `DELETE /api/reports/<id>/share` with `reports.create` permission.
  2. Open `/share/reports/<token>` again with no session.
  3. Guess a second token by changing one character.
- **Expected:** The revoked URL does not show results (404 or a dedicated revoked message). The guessed token does not show results. Tokens are long and unguessable ([SEC-SHARE-001](#sec-share-001--share-token-entropy-and-revocation)).
- **Automation:** `e2e/functional/reports.spec.ts`

### FN-REP-005 — Milestone export

- **Priority:** P1
- **Area:** Reports
- **Preconditions:** Admin. Milestone "Harbor 2.4 checkout gate" exists.
- **Steps:**
  1. `GET /api/milestones/export` with the admin session.
  2. Repeat as viewer and as custom.
- **Expected:** Admin receives a file that names the milestone and its Go / At risk / No go outcome. Viewer is allowed (`milestones.view`). Custom is 403 `Missing permission: milestones.view`. The export does not include Foreign Project milestones.
- **Automation:** `e2e/functional/reports.spec.ts`

#### Quality graph

The quality graph is off by default in the nav. Turn it on under **Settings → Account**, control **Quality graph** (`aria-pressed`, label flips between **Quality graph off** and **Quality graph on**). Routes: `/intents`, `/impact`, `/milestones`, `/releases`, `/journeys`, `/requirements`, `/risks`, `/components`, `/proposals`.

### FN-QG-001 — Toggle on shows nav and palette

- **Priority:** P0
- **Area:** Quality graph
- **Preconditions:** Admin. Toggle currently off.
- **Steps:**
  1. Confirm the sidebar has Hub, Test cases, Plans, Test runs, Automation, Triage, Reports, Settings, and no Intents link.
  2. Open `/settings?section=account` and press **Quality graph** until it reads **Quality graph on**. Toast or status: "Quality graph shown in the sidebar".
  3. Open the command palette (**Search ⌘K** or Ctrl+K) and type `Intents`.
- **Expected:** Sidebar group **Quality graph** lists Intents, Impact, Milestones, Releases, Journeys, Requirements, Risks, Components, Proposals. Palette includes those destinations plus **Connect**. `PATCH /api/workspace/preferences` persists the flag. Reload keeps it on.
- **Automation:** `e2e/functional/quality-graph.spec.ts`

### FN-QG-002 — Toggle off hides the nav, except the page you are on

- **Priority:** P0
- **Area:** Quality graph
- **Preconditions:** Toggle on. Admin.
- **Steps:**
  1. Open `/intents`.
  2. Turn **Quality graph** off. Toast: "Quality graph hidden from the sidebar".
  3. Stay on `/intents` and reload.
  4. Navigate to `/cases`, then look at the sidebar.
  5. Open the palette and search `Journeys`.
- **Expected:** While the URL is `/intents`, that item stays in the sidebar so the user is not stranded. Other quality-graph items are hidden. After leaving for `/cases`, the whole group is hidden. Palette no longer lists Journeys, Intents, or the other quality-graph hrefs. `/milestones` is part of this group (it is not in the default nav). Direct URL `/risks` still loads for a user with `requirements`/`risks` read access; the nav does not need to list it.
- **Automation:** `e2e/functional/quality-graph.spec.ts`

### FN-QG-003 — Intents: owner, comments, reliability

- **Priority:** P1
- **Area:** Quality graph
- **Preconditions:** Admin. Toggle on. Demo seed has intents.
- **Steps:**
  1. Open `/intents`. Create an intent titled `Intent <timestamp>` (`POST /api/intents`).
  2. Set the owner to Member (`PUT /api/intents/<id>/owner`).
  3. Post a comment (`POST /api/intents/<id>/comments`).
  4. Open reliability (`GET /api/intents/<id>/reliability`).
- **Expected:** The intent appears in the list. Owner shows the member. The comment is visible after reload. Reliability returns JSON without 500. Viewer can GET and cannot POST (403 `intents.create`). Custom role 403 on GET (`intents.view` denied).
- **Automation:** `e2e/functional/quality-graph.spec.ts`

### FN-QG-004 — Impact and path rules

- **Priority:** P1
- **Area:** Quality graph
- **Preconditions:** Admin. Toggle on.
- **Steps:**
  1. Open `/impact`.
  2. Create a path rule that maps `src/checkout/**` to a component key (`POST /api/path-rules`).
  3. `POST /api/affected` with bearer `topo_e2e_read_token` and body paths `["src/checkout/cart.ts"]`.
- **Expected:** Impact shows blast radius for a known component or an empty state that names Impact. The path rule is listed. Affected returns the component (and linked intents if the demo graph has them) for that path. A path outside the rule is not reported as that component. Delete the rule (`DELETE /api/path-rules`) and the path no longer matches.
- **Automation:** `e2e/functional/quality-graph.spec.ts`

### FN-QG-005 — Releases: detail, analyze, compare

- **Priority:** P1
- **Area:** Quality graph
- **Preconditions:** Admin. Toggle on.
- **Steps:**
  1. Create a release `rel-<timestamp>` (`POST /api/releases`).
  2. Open `/releases/<id>`.
  3. `POST /api/releases/analyze` with a small JSON body (or the analyze control on the page).
  4. Create a second release and open `/releases/compare` (or `POST /api/releases/compare`).
  5. `DELETE /api/releases/<id>` on a throwaway release.
- **Expected:** Detail loads. Analyze returns a summary without 500. Compare shows both releases and does not mix Harbor Beta data. Delete removes the throwaway release. Viewer GET is allowed (`releases.view`); viewer POST/DELETE is 403.
- **Automation:** `e2e/functional/quality-graph.spec.ts`

### FN-QG-006 — Journeys and requirements

- **Priority:** P1
- **Area:** Quality graph
- **Preconditions:** Admin. Toggle on. Demo seed includes a journey and requirements.
- **Steps:**
  1. Open `/journeys`. Create a journey `Journey <timestamp>` (`POST /api/journeys`).
  2. Open `/requirements`. Create `REQ-REL-<timestamp>` (`POST /api/requirements`).
  3. Set an owner (`PUT /api/requirements/<id>/owner`) and a comment (`POST /api/requirements/<id>/comments`).
- **Expected:** Both rows persist after reload. Owner and comment display. PATCH edits the title. Viewer can read and cannot create. Custom cannot read.
- **Automation:** `e2e/functional/quality-graph.spec.ts`

### FN-QG-007 — Risks and components

- **Priority:** P2
- **Area:** Quality graph
- **Preconditions:** Admin. Toggle on.
- **Steps:**
  1. Open `/risks`. Create a risk `Risk <timestamp>` (`POST /api/risks`).
  2. Open `/components`. Create a component `comp-<timestamp>` (`POST /api/components`).
  3. Link them if the UI offers a mitigation edge.
- **Expected:** Both lists show the new rows after reload. The edge, if created, is visible from the risk or the impact view. Viewer GET succeeds; POST is 403 for a viewer if the route requires a write action in the requirements or related catalog. Custom GET is 403.
- **Automation:** `e2e/functional/quality-graph.spec.ts`

### FN-QG-008 — Proposals review

- **Priority:** P1
- **Area:** Quality graph
- **Preconditions:** Admin. Toggle on. A pending proposal (create one with `POST /api/proposals`, or the agent tool `propose_coverage` using `topo_e2e_agent_token`).
- **Steps:**
  1. Open `/proposals`.
  2. Accept the proposal (`PATCH /api/proposals` review action).
  3. Create another proposal and reject it.
  4. As member, accept a third proposal.
  5. As viewer, PATCH a review.
- **Expected:** Accept writes the graph change the proposal described. Reject does not. Member is allowed (`proposals.review` is on the member role). Viewer is 403 `Missing permission: proposals.review` and the review buttons are disabled. Custom is 403 on GET (`proposals.view` denied).
- **Automation:** `e2e/functional/quality-graph.spec.ts`

#### Settings

Settings pages, from `src/lib/settings-sections.ts`: Account, Projects, Access, Integrations, Security. Canonical URLs use `?section=` plus an optional hash anchor.

### FN-SET-001 — Account profile, preferences, and theme

- **Priority:** P0
- **Area:** Settings
- **Preconditions:** Admin.
- **Steps:**
  1. Open `/settings?section=account#profile`. Change the display name. Save (`PATCH /api/settings`).
  2. Open `#preferences`. Set **Color theme** to Light, then Dark, then System.
  3. Toggle **Quality graph** off and on (behavior is [FN-QG-001](#fn-qg-001--toggle-on-shows-nav-and-palette)).
- **Expected:** The name survives reload. Theme cycle order is system, light, dark, and the choice survives a new session ([UX-THEME-001](#ux-theme-001--theme-persists)). Preferences anchor scrolls into view.
- **Automation:** `e2e/functional/settings.spec.ts`

### FN-SET-002 — Projects and custom fields

- **Priority:** P1
- **Area:** Settings
- **Preconditions:** Admin.
- **Steps:**
  1. Open `/settings?section=projects`.
  2. Confirm Harbor and Harbor Beta are listed. Create `SettingsProj-<timestamp>` and archive or leave it.
  3. Open `#fields` and create a field `Build` as in [FN-CASES-005](#fn-cases-005--custom-fields).
- **Expected:** The new project is in `GET /api/projects`. Field create hits `POST /api/custom-fields`. Member can open settings (`settings.view`) and cannot create a project (403 `project.manage`).
- **Automation:** `e2e/functional/settings.spec.ts`

### FN-SET-003 — Members, invites, and custom roles

- **Priority:** P0
- **Area:** Settings
- **Preconditions:** Admin.
- **Steps:**
  1. Open `/settings?section=access#members`. Confirm demo (admin), member, viewer, and custom are listed. Custom's role is **E2E view cases and runs** (not a system role; coarse membership enum `viewer`). `other@` is not a Harbor member.
  2. Invite `temp-<timestamp>@topology.local` as Viewer (cancel or expire it after).
  3. Open `#roles`. Create a role `QA read <timestamp>` with only `cases.view` and `runs.view` (`POST /api/roles`).
  4. As member, `POST /api/roles` and send an invite.
- **Expected:** The invite row exists and the token works only for that email at viewer level ([FN-AUTH-005](#fn-auth-005--accept-an-invite)). The new role's coarse membership enum is `viewer` (`inferLegacyRole` on a non-writing allow-list). Member receives 403 `Missing permission: members.invite` and `Missing permission: roles.manage`. Member still has `settings.view`.
- **Automation:** `e2e/functional/settings.spec.ts`

### FN-SET-004 — Connections, CI setup, and repositories

- **Priority:** P1
- **Area:** Settings
- **Preconditions:** Admin.
- **Steps:**
  1. Open `/settings?section=integrations#connections`. Confirm the MCP snippet references `TOPOLOGY_URL` and a token placeholder, not `topo_e2e_read_token` in clear text from another user.
  2. Open `/connect`.
  3. Open `#ci` and read the `ci-write` instructions.
  4. Open `#repositories`. Add a repository `https://github.com/example/topology-release` (`POST /api/repositories`).
- **Expected:** `/connect` redirects to the connections anchor. CI instructions mention a `ci-write` token and `POST /api/ci/junit`. The repository is listed. The page does not echo `AUTH_SECRET` or tracker tokens.
- **Automation:** `e2e/functional/settings.spec.ts`

### FN-SET-005 — AI provider none, and webhooks

- **Priority:** P1
- **Area:** Settings
- **Preconditions:** Admin. `TOPOLOGY_AI_PROVIDER` unset or `none`. A local HTTP receiver is optional here; signature checks are [INT-HOOK-001](#int-hook-001--outbound-webhook-payload-and-signature).
- **Steps:**
  1. Open `#ai`. Confirm the provider is none and the app does not require a key.
  2. `PUT /api/ai/provider` with a dummy base URL `http://127.0.0.1:9` and a fake key.
  3. Open `#webhooks`. Create an endpoint URL `https://example.com/hooks/topology` subscribed to `run.completed`, with a secret (`POST /api/webhooks`).
  4. As member, POST a webhook.
- **Expected:** Step 2 is rejected as SSRF (or the key is refused). The fake key is not returned by `GET /api/ai/provider` and is not in the HTML. Step 3 lists the endpoint without printing the secret again. Member POST is 403 `Missing permission: webhooks.manage`. Event names accepted: `run.completed`, `issue.created`, `intent.stale`, `coverage.dropped`, `proposal.created`.
- **Automation:** `e2e/functional/settings.spec.ts`

### FN-SET-006 — Create and revoke an API token

- **Priority:** P0
- **Area:** Settings
- **Preconditions:** Admin.
- **Steps:**
  1. Open `/settings?section=security#tokens`.
  2. Create a token named `release-<timestamp>` with scope `read` (`POST /api/tokens`).
  3. Copy the plaintext once. `GET /api/cases` with that bearer.
  4. Revoke it (`DELETE /api/tokens`).
  5. Call `GET /api/cases` again with the same bearer.
- **Expected:** The plaintext is shown once and is not in `GET /api/tokens` afterward (only a prefix or label). Step 3 is 200. Step 5 is 401. Member cannot create a token if the route requires an admin action; if a member can create one, the token must not exceed the member's own rights. Record the actual status if it differs, and fail the case if a member-minted token can call `POST /api/roles`.
- **Automation:** `e2e/functional/settings.spec.ts`

### FN-SET-007 — Audit log records sensitive actions

- **Priority:** P0
- **Area:** Settings
- **Preconditions:** Admin. Perform, in this session, a token create, a report export, a role create, and an invite.
- **Steps:**
  1. Open `/settings?section=security#audit`.
  2. `GET /api/audit`.
- **Expected:** The log lists those actions (`export.report` and the token, role, and invite actions) with actor, time, and target. Entries do not contain the token plaintext, webhook secret, `AUTH_SECRET`, or OAuth client secret. Viewer with `settings.view` may read the log; custom role receives 403. A missing row for token create or export is a failure.
- **Automation:** `e2e/functional/settings.spec.ts`

### FN-SET-008 — Legacy ?section= aliases

- **Priority:** P1
- **Area:** Settings
- **Preconditions:** Admin.
- **Steps:** Open each URL and confirm the canonical page and the anchor:
  1. `/settings?section=profile` → Account, `#profile`
  2. `/settings?section=preferences` → Account, `#preferences`
  3. `/settings?section=workspace` → Projects
  4. `/settings?section=fields` → Projects, `#fields`
  5. `/settings?section=members` → Access, `#members`
  6. `/settings?section=roles` → Access, `#roles`
  7. `/settings?section=connections` → Integrations, `#connections`
  8. `/settings?section=ci` → Integrations, `#ci`
  9. `/settings?section=repositories` → Integrations, `#repositories`
  10. `/settings?section=ai` → Integrations, `#ai`
  11. `/settings?section=webhooks` → Integrations, `#webhooks`
  12. `/settings?section=tokens` → Security, `#tokens`
  13. `/settings?section=audit` → Security, `#audit`
  14. `/settings?section=nope` → Account
- **Expected:** Each alias lands on the page in `resolveSettingsSection` (`src/lib/settings-sections.ts`). The address bar may stay on the alias or replace it; the visible page must be the canonical one, and the anchor must scroll. Unknown values fall back to Account, not a 500.
- **Automation:** `e2e/functional/settings.spec.ts`

#### Live updates

### FN-LIVE-001 — Result in one browser shows in another

- **Priority:** P0
- **Area:** Live
- **Preconditions:** Two contexts, both `member@topology.local` or admin. The same in-progress run open in both. Context B has DevTools or the test listener on `GET /api/live` (SSE).
- **Steps:**
  1. In context A, mark a case Failed with note `live-<timestamp>`.
  2. Do not reload context B.
- **Expected:** Context B's row becomes Failed and shows the note. The SSE stream delivered the event. The document `load` event does not fire again in B.
- **Automation:** `e2e/functional/live.spec.ts`

### FN-LIVE-002 — Live stream requires a session

- **Priority:** P0
- **Area:** Live
- **Preconditions:** None signed in.
- **Steps:**
  1. `GET /api/live` with no cookie.
  2. `GET /api/live` as viewer.
- **Expected:** Step 1 is 401. Step 2 opens the stream (viewer can read run updates) and does not include Foreign Project events.
- **Automation:** `e2e/functional/live.spec.ts`

### Access control

Automation: `e2e/rbac/*.spec.ts` for UI and cookie-backed API checks, and `tests/integration/rbac.integration.test.ts` for the matrix and IDOR sweep.

#### Role matrix

Actions are the 41 entries of `ACTION_CATALOG` in `src/lib/permissions.ts`. System roles come from `SYSTEM_ROLE_ACTIONS`. The seeded custom role is named **E2E view cases and runs**. It is not a system role. Its allow-list is only `cases.view` and `runs.view`. The coarse membership enum stored beside it is `viewer`.

Allow means the API returns a success status (200, 201, or 204) and the UI control is enabled. Deny means HTTP 403 with `Missing permission: <action>` and the control is hidden or disabled. A 200 that mutates data for a Deny cell is a P0 defect even if the button was hidden.

| Action | Admin | Member | Viewer | Custom |
| --- | --- | --- | --- | --- |
| `cases.view` | Allow | Allow | Allow | Allow |
| `cases.create` | Allow | Allow | Deny | Deny |
| `cases.edit` | Allow | Allow | Deny | Deny |
| `cases.delete` | Allow | Allow | Deny | Deny |
| `intents.view` | Allow | Allow | Allow | Deny |
| `intents.create` | Allow | Allow | Deny | Deny |
| `intents.edit` | Allow | Allow | Deny | Deny |
| `intents.delete` | Allow | Allow | Deny | Deny |
| `requirements.view` | Allow | Allow | Allow | Deny |
| `requirements.create` | Allow | Allow | Deny | Deny |
| `requirements.edit` | Allow | Allow | Deny | Deny |
| `requirements.delete` | Allow | Allow | Deny | Deny |
| `proposals.view` | Allow | Allow | Allow | Deny |
| `proposals.create` | Allow | Allow | Deny | Deny |
| `proposals.review` | Allow | Allow | Deny | Deny |
| `releases.view` | Allow | Allow | Allow | Deny |
| `releases.create` | Allow | Allow | Deny | Deny |
| `releases.edit` | Allow | Allow | Deny | Deny |
| `releases.delete` | Allow | Allow | Deny | Deny |
| `journeys.view` | Allow | Allow | Allow | Deny |
| `journeys.create` | Allow | Allow | Deny | Deny |
| `journeys.edit` | Allow | Allow | Deny | Deny |
| `journeys.delete` | Allow | Allow | Deny | Deny |
| `runs.view` | Allow | Allow | Allow | Allow |
| `runs.create` | Allow | Allow | Deny | Deny |
| `runs.edit` | Allow | Allow | Deny | Deny |
| `runs.delete` | Allow | Allow | Deny | Deny |
| `runs.complete` | Allow | Allow | Deny | Deny |
| `reports.view` | Allow | Allow | Allow | Deny |
| `reports.create` | Allow | Allow | Deny | Deny |
| `automation.view` | Allow | Allow | Allow | Deny |
| `automation.manage` | Allow | Allow | Deny | Deny |
| `milestones.view` | Allow | Allow | Allow | Deny |
| `milestones.manage` | Allow | Allow | Deny | Deny |
| `triage.manage` | Allow | Allow | Deny | Deny |
| `folders.manage` | Allow | Allow | Deny | Deny |
| `settings.view` | Allow | Allow | Allow | Deny |
| `webhooks.manage` | Allow | Deny | Deny | Deny |
| `project.manage` | Allow | Deny | Deny | Deny |
| `members.invite` | Allow | Deny | Deny | Deny |
| `roles.manage` | Allow | Deny | Deny | Deny |

Member is denied only `webhooks.manage`, `project.manage`, `members.invite`, and `roles.manage`. Viewer is read-only plus `settings.view`. The coarse enum on the custom membership is `viewer`. The allow-list is not the system viewer role: intents, reports, automation, milestones, and settings are denied.

### RBAC-ROLE-001 — Admin UI exposes every write control

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Signed in as `demo@topology.local`. Quality graph on so those screens can be checked.
- **Steps:**
  1. On `/cases`, confirm **New case**, folder **New folder**, and row delete are enabled.
  2. On `/runs/new`, confirm the start control is enabled.
  3. On `/settings?section=access`, confirm invite and role create are enabled.
  4. On `/settings?section=integrations#webhooks`, confirm endpoint create is enabled.
  5. On `/settings?section=projects`, confirm project create is enabled.
- **Expected:** Each control works and matches an Allow cell. No Allow cell returns 403 for admin.
- **Automation:** `e2e/rbac/roles.spec.ts`

### RBAC-ROLE-002 — Member does not see admin-only controls

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Signed in as `member@topology.local`.
- **Steps:**
  1. Open `/cases` and create a case (must work).
  2. Open `/settings?section=access`. Try to invite and to create a role.
  3. Open `/settings?section=projects` and try to create a project.
  4. Open webhook settings and try to add an endpoint.
  5. Complete a run you created (must work).
- **Expected:** Case create and run complete succeed. Invite, role create, project create, and webhook create are hidden or disabled. The matching API calls return 403 with `Missing permission: members.invite`, `roles.manage`, `project.manage`, or `webhooks.manage`. Settings itself still loads (`settings.view`).
- **Automation:** `e2e/rbac/roles.spec.ts`

### RBAC-ROLE-003 — Viewer is read-only

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Signed in as `viewer@topology.local`. Quality graph on.
- **Steps:**
  1. Open `/cases`, `/runs`, `/reports`, `/automation`, `/milestones`, `/intents`, `/requirements`, `/proposals`, `/releases`, `/journeys`.
  2. Attempt **New case**, a result status button, **Complete run**, **Create issue**, folder **New folder**, and proposal accept.
- **Expected:** Every page in step 1 loads data. Every control in step 2 is hidden or disabled. Direct API writes return 403. `GET /api/settings` succeeds.
- **Automation:** `e2e/rbac/roles.spec.ts`

### RBAC-ROLE-004 — Custom role is only cases.view and runs.view

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Signed in as `custom@topology.local`. The role is **E2E view cases and runs** (not a system role; coarse membership enum `viewer`).
- **Steps:**
  1. Open `/cases` and `/runs/<seeded run id>`.
  2. Open `/reports`, `/automation`, `/triage`, `/intents`, `/settings?section=security`.
  3. Click **New case** if it is visible. `POST /api/cases`, `PATCH /api/runs/<id>` to set a result, `GET /api/reports`, `GET /api/intents`, `GET /api/settings`.
- **Expected:** Step 1 shows cases and the run, with status buttons disabled. Step 2 does not show other projects' data; APIs in step 3 that are not `cases.view` or `runs.view` return 403. `POST /api/cases` and result PATCH return 403 `Missing permission: cases.create` and `Missing permission: runs.edit`. The user cannot reach Harbor Beta or Foreign Project by typing ids ([RBAC-IDOR-001](#rbac-idor-001--cross-project-harbor-beta)).
- **Automation:** `e2e/rbac/roles.spec.ts`

### RBAC-API-001 — Cases and folders actions

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Four sessions. A disposable case id in Harbor.
- **Steps:** For admin, member, viewer, and custom, call:
  1. `GET /api/cases` → `cases.view`
  2. `POST /api/cases` with a unique key → `cases.create`
  3. `PATCH /api/cases/<id>` → `cases.edit`
  4. `DELETE /api/cases/<id>` → `cases.delete`
  5. `POST /api/folders` → `folders.manage`
- **Expected:** Status codes match the matrix. Deny bodies contain `Missing permission:` and the action name. Cleanup deletes only with an admin token so later cases still have seed data.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-API-002 — Intents actions

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Four sessions. Quality graph data present.
- **Steps:** For each role:
  1. `GET /api/intents` → `intents.view`
  2. `POST /api/intents` → `intents.create`
  3. `PATCH /api/intents` (edit the row just created, as admin if the role was denied create) → `intents.edit`
  4. Delete or the delete branch of that route → `intents.delete`
- **Expected:** Viewer is allowed on GET only. Custom is denied on all four. Member matches admin.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-API-003 — Requirements actions

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Four sessions.
- **Steps:** For each role: `GET /api/requirements`, `POST /api/requirements`, `PATCH /api/requirements`, and the delete path the route exposes.
- **Expected:** Map to `requirements.view`, `requirements.create`, `requirements.edit`, `requirements.delete` per the matrix.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-API-004 — Proposals actions

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Four sessions. One pending proposal created as admin.
- **Steps:** For each role: `GET /api/proposals`, `POST /api/proposals`, `PATCH /api/proposals` with an accept body.
- **Expected:** Map to `proposals.view`, `proposals.create`, `proposals.review`. Member may accept. Viewer and custom may not. A denied PATCH does not change proposal status.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-API-005 — Releases actions

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Four sessions.
- **Steps:** For each role: `GET /api/releases`, `POST /api/releases`, `PATCH /api/releases`, `DELETE /api/releases/<throwaway id>`.
- **Expected:** Map to `releases.view`, `releases.create`, `releases.edit`, `releases.delete`.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-API-006 — Journeys actions

- **Priority:** P1
- **Area:** RBAC
- **Preconditions:** Four sessions.
- **Steps:** For each role: `GET /api/journeys`, `POST /api/journeys`, `PATCH /api/journeys`, and delete.
- **Expected:** Map to `journeys.view`, `journeys.create`, `journeys.edit`, `journeys.delete`.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-API-007 — Runs actions

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Four sessions. An in-progress run and a case.
- **Steps:** For each role:
  1. `GET /api/runs` and `GET /api/runs/<id>` → `runs.view`
  2. `POST /api/runs` → `runs.create`
  3. PATCH a result status → `runs.edit`
  4. Delete a throwaway run → `runs.delete`
  5. Complete a throwaway run → `runs.complete`
- **Expected:** Custom is allowed only on GET. Viewer is allowed only on GET. Member matches admin. A denied complete leaves the run in progress.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-API-008 — Reports, automation, and milestones

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Four sessions.
- **Steps:** For each role:
  1. `GET /api/reports/<id>/export?format=csv` → `reports.view`
  2. The create-report or share POST → `reports.create`
  3. `GET /api/flake` and open `/automation` data → `automation.view`
  4. The automation manage mutation the UI uses (ingest is token-scoped; a session manage action such as deleting an automated run) → `automation.manage`
  5. `GET /api/milestones` → `milestones.view`
  6. `POST /api/milestones` → `milestones.manage`
- **Expected:** Viewer is allowed on the three GETs and denied on creates. Custom is denied on all of them, including milestone and report GETs.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-API-009 — Triage manage

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Four sessions. A triage group exists.
- **Steps:** For each role, `GET /api/triage` and `PATCH /api/triage` with a bulk body.
- **Expected:** `triage.manage` is Allow for admin and member, Deny for viewer and custom. If GET is gated on `triage.manage` rather than a view action, viewer GET is 403 and the `/triage` page must not dump the JSON another way. Custom never succeeds at PATCH.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-API-010 — Settings, webhooks, projects, invites, and roles

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Four sessions.
- **Steps:** For each role:
  1. `GET /api/settings` → `settings.view`
  2. `POST /api/webhooks` → `webhooks.manage`
  3. `POST /api/projects` → `project.manage`
  4. Create an invite from Access → `members.invite`
  5. `POST /api/roles` → `roles.manage`
- **Expected:** Only admin succeeds at steps 2–5. Member and viewer succeed at step 1. Custom fails step 1 with `Missing permission: settings.view` and fails 2–5 as well. No custom-role response is HTTP 200 with an admin side effect.
- **Automation:** `tests/integration/rbac.integration.test.ts`

#### Tokens

### RBAC-TOK-001 — read scope

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** No browser session. `Authorization: Bearer topo_e2e_read_token`. Harbor project header.
- **Steps:**
  1. `GET /api/ci/runs`
  2. `POST /api/query` with `{ "dsl": "executions where status = failed" }`
  3. `GET /api/coverage`
  4. `POST /api/affected` with a path list
  5. `POST /api/ci/junit` with a tiny payload
  6. `POST /api/agent` with a `list_cases` style body (or `GET /api/agent?resource=intents`)
- **Expected:** Steps 1–4 succeed (read includes those routes). Steps 5 and 6 are 403 because `read` does not include `ci-write` or `agent`. Responses contain Harbor data only.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-TOK-002 — ci-write scope

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Bearer `topo_e2e_ci_token`. No session cookie.
- **Steps:**
  1. `GET /api/ci/runs` (read satisfied by ci-write).
  2. `POST /api/ci/junit` using `fixtures/junit/smoke.xml`.
  3. `POST /api/ci/runs`, `POST /api/ci/runs/<id>/shards`, `POST /api/ci/runs/<id>/complete`.
  4. `POST /api/executions` and `POST /api/git/ingest` with a minimal valid body.
  5. `GET /api/agent?resource=intents`.
- **Expected:** Steps 1–4 succeed. Step 5 is 403 (`ci-write` does not grant `agent`). A missing session cookie must not cause a redirect to `/login`. If middleware blocks `/api/git/ingest` or `/api/query` before the handler, that is a P0 defect: CLI routes must accept a bearer token alone.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-TOK-003 — agent scope

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Bearer `topo_e2e_agent_token`.
- **Steps:**
  1. `GET /api/agent?resource=intents&key=<seeded key>` (or the list resource the route documents).
  2. `POST /api/agent` for `create_case` with a unique title.
  3. `POST /api/ci/junit` with the same token.
- **Expected:** Steps 1 and 2 succeed. The created case is in Harbor. Step 3 is 403 (`agent` does not grant `ci-write`). Read-level GETs such as `/api/coverage` succeed.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-TOK-004 — Revoked token

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Bearer `topo_e2e_revoked_token`.
- **Steps:**
  1. `GET /api/ci/runs`
  2. `GET /api/cases` if that route accepts bearer auth
  3. `POST /api/ci/junit`
- **Expected:** Every call is 401. None return case titles. Revocation is immediate (no grace cache).
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-TOK-005 — Expired token is 401

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Admin session. The seed has no expired token; this case makes one.
- **Steps:**
  1. Create a read token in Settings → Security.
  2. Set its `expires_at` to yesterday in `api_tokens`.
  3. `GET /api/ci/runs` with that bearer.
- **Expected:** 401. The audit log does not store the plaintext. A token with `expires_at` in the future still works.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-TOK-006 — Environment token rejected in production

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** A production-mode server (`NODE_ENV=production`, `next start` or the container) with `TOPOLOGY_API_TOKEN=topo_from_env_should_fail` and no matching hashed row that was created on purpose. Also a non-production server with `TOPOLOGY_ALLOW_ENV_API_TOKEN=1` for the contrast call.
- **Steps:**
  1. Against production, `GET /api/ci/runs` with `Authorization: Bearer topo_from_env_should_fail`.
  2. Repeat production with `TOPOLOGY_ALLOW_ENV_API_TOKEN=1` still set.
  3. Against dev, with the flag unset, send the same header.
  4. Against dev, with the flag set and the env value equal to a seed-time token that was hashed into `api_tokens`, confirm the hashed row works, and confirm an env value that was never hashed is accepted only in that non-production flagged mode.
- **Expected:** Steps 1 and 2 are 401. Production never accepts the process env as a bearer. Step 3 is 401. Step 4 behaves as `src/lib/ci-auth.ts` documents: env bearer only when not production and the flag is on. Do not enable the flag in the production Compose file.
- **Automation:** `tests/integration/rbac.integration.test.ts`

#### IDOR

Build the foreign ids first: sign in as `other@topology.local`, create case `FOREIGN-<timestamp>` and a run in **Foreign Project**, and note every id. Sign in as admin on Harbor Beta and create `BETAIDOR-<timestamp>`. Then call as `demo@topology.local` with the Harbor project id.

Routes to sweep (every dynamic id route). Use the foreign id in the path. Expect 404 or 403. The body, headers, and any SSE frame must not contain `FOREIGN-<timestamp>`, the foreign run name, or Foreign Project attachment bytes.

- `/api/cases/<id>`, `/api/cases/<id>/versions`, `/api/cases/<id>/versions/<versionId>`, `/api/cases/<id>/activity`
- `/api/runs/<id>`
- `/api/plans/<id>`, `/api/plans/<id>/launch`
- `/api/folders/<id>`
- `/api/views/<id>`
- `/api/custom-fields/<id>`
- `/api/shared-steps/<id>`
- `/api/attachments/<id>`
- `/api/results/<id>/attachments`, `/api/results/<id>/comments`
- `/api/reports/<id>/export`, `/api/reports/<id>/share`
- `/api/intents/<id>/comments`, `/api/intents/<id>/reliability`, `/api/intents/<id>/owner`
- `/api/requirements/<id>/comments`, `/api/requirements/<id>/owner`
- `/api/releases/<id>`
- `/api/ci/runs/<id>/complete`, `/api/ci/runs/<id>/shards`
- `/api/collab/<entityType>/<id>/owner`, `/api/collab/<entityType>/<id>/comments`

Also send Harbor-authenticated requests with `x-topology-project-id` set to the Foreign Project id and to the Harbor Beta id when the session is pinned to Harbor.

### RBAC-IDOR-001 — Cross-project Harbor Beta

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** Case `BETAIDOR-<timestamp>` exists only in Harbor Beta (seeded case key **BETA-1**). Harbor sessions for admin, member, viewer, and custom each get a turn on steps 1–3. Only `demo@topology.local` is a member of Harbor Beta. `member@topology.local`, `viewer@topology.local`, and `custom@topology.local` are Harbor members only.
- **Steps:**
  1. `GET /api/cases/<beta-id>` with the Harbor project header.
  2. `GET /api/cases?q=BETAIDOR-<timestamp>` on Harbor.
  3. `PATCH /api/cases/<beta-id>` with a new title.
  4. As the demo admin, switch the session to Harbor Beta and `GET` a Harbor-only case id. member, viewer, and custom have no Harbor Beta membership, so they do not switch.
- **Expected:** Steps 1 and 3 are 404 or 403 and do not change the Harbor Beta title (confirm afterward as the demo admin on Harbor Beta). Step 2's list does not include the beta case. Step 4 does not return the Harbor case. Repeat for one run id and one attachment id.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-IDOR-002 — Cross-workspace Foreign Project

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** `FOREIGN-<timestamp>` exists in Foreign Project (slug `foreign-project`; seeded case key **FOR-1**). Callers are demo, member, viewer, custom, and also `topo_e2e_read_token` / `topo_e2e_ci_token` / `topo_e2e_agent_token` (those tokens are owned by the demo admin on Harbor).
- **Steps:**
  1. For each dynamic route in the list above, call with the foreign id.
  2. `POST /api/plans/<foreign-plan-id>/launch` and `POST /api/ci/runs/<foreign-id>/complete`.
  3. `GET /api/attachments/<foreign-attachment-id>`.
  4. As `other@`, `GET` a Harbor case id.
- **Expected:** All of 1–3 are 404 or 403 with no foreign title and no attachment bytes. Step 4 is 404 or 403 with no Harbor title. A 200 on any of these is S0.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### RBAC-IDOR-003 — Filesystem-driven id sweep stays current

- **Priority:** P0
- **Area:** RBAC
- **Preconditions:** The integration test walks `src/app/api/**/[*]/route.ts` rather than a hand-copied list.
- **Steps:**
  1. Generate the route list from disk.
  2. For each method exported (`GET`, `POST`, `PATCH`, `PUT`, `DELETE`), call it as admin with a Foreign Project id and with a random UUID.
  3. Fail the test if a new dynamic route is added and not requested.
- **Expected:** Every generated call is 400, 403, or 404, never 200 with a body that includes `Foreign` or another workspace's case key. 500 is a failure (it leaks implementation details). The hand list in this section is the minimum; the generator is the release check.
- **Automation:** `tests/integration/rbac.integration.test.ts`

### Security

Automation: `e2e/security/*.spec.ts` and `tests/integration/security.integration.test.ts`. ZAP is manual.

Public routes that may answer without a session cookie: `/api/health`, `/health`, `/api/auth/*`, `/login`, `/setup` and `/api/setup` only while no admin exists, `/api/invites/<token>`, `/invite/<token>`, `/share/reports/<token>`, `/api/share/reports/<token>/export`, and `POST /api/webhooks/github` (which still fails closed). Token routes (`/api/ci/*`, `/api/agent`, `/api/executions`, `/api/releases`, `/api/query`, `/api/affected`, `/api/coverage`, `/api/git/ingest`) are not anonymous: they require a bearer token and must not redirect to `/login`.

`src/auth.config.ts` currently lets `/api/ci`, `/api/agent`, `/api/executions`, `/api/releases`, health, invites, setup, auth, and GitHub webhooks through middleware without a session. Handlers still authenticate. Exact `/api/affected`, `/api/coverage`, `/api/query` and `/api/git/ingest` paths are also explicitly allowed through proxy interception; handlers authenticate and enforce token scopes. Any future CLI route missing from that allowlist must be added if it redirects a valid bearer request to login. That bug fails [RBAC-TOK-002](#rbac-tok-002--ci-write-scope) and [SEC-UNAUTH-003](#sec-unauth-003--token-routes-reject-a-missing-bearer).

### SEC-UNAUTH-001 — Unauthenticated sweep of every API method

- **Priority:** P0
- **Area:** Security
- **Preconditions:** No cookie, no bearer. The test lists methods by reading `src/app/api/**/route.ts`.
- **Steps:**
  1. For each exported method, send a request with an empty body or `{}` and a random UUID where the path has an id.
  2. Subtract the public allowlist above.
- **Expected:** Every non-public method returns 401 (or 403), not 200 and not a redirect to HTML login that a JSON client would treat as success. A new route file is covered without editing the test list. 500 counts as a failure.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-UNAUTH-002 — Public allowlist stays public and small

- **Priority:** P0
- **Area:** Security
- **Preconditions:** No session. An admin already exists, so setup is closed. A valid share token and a valid invite token exist.
- **Steps:**
  1. `GET /api/health` and `GET /health`.
  2. `GET /login` and `GET /api/auth/session` (or the Auth.js session URL the app exposes).
  3. `GET /api/setup` and `POST /api/setup` after an admin exists.
  4. `GET /api/invites/<valid>` and `GET /invite/<valid>`.
  5. `GET /share/reports/<valid>`.
  6. `GET /api/cases` with no credentials, as a negative control.
- **Expected:** Health is 200 and does not include `DATABASE_URL` or secrets. Login renders. Setup POST is refused once an admin exists. Invite GET does not include other members' password hashes. Share GET renders the report. Step 6 is 401. No other namespace answers 200 anonymously.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-UNAUTH-003 — Token routes reject a missing bearer

- **Priority:** P0
- **Area:** Security
- **Preconditions:** No cookie and no Authorization header.
- **Steps:** Call `POST /api/ci/junit`, `GET /api/ci/runs`, `POST /api/ci/runs`, `POST /api/executions`, `GET /api/agent`, `POST /api/releases`, `POST /api/query`, `POST /api/affected`, `GET /api/coverage`, `POST /api/git/ingest`.
- **Expected:** Each is 401 JSON. None is HTTP 200. None is a 302/307 to `/login` when the client sends `Accept: application/json`. Middleware may allow the request to reach the handler; the handler must still reject it.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-SESS-001 — Session cookie flags

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Sign in as admin on `http://127.0.0.1:4317`. Repeat behind HTTPS for `Secure` (Compose with TLS, or a one-off `AUTH_URL=https://...`).
- **Steps:**
  1. Read `Set-Cookie` on the sign-in response.
  2. From the browser, `document.cookie` and look for the session name.
- **Expected:** The session cookie is `HttpOnly` and `SameSite=Lax` (or `Strict`). `document.cookie` does not contain it. On HTTPS it is `Secure`. On plain HTTP localhost, `Secure` may be absent; that exception does not apply to the production origin.
- **Automation:** `e2e/security/session.spec.ts`

### SEC-SESS-002 — Logout invalidates the session

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Signed in. Copy the session cookie value.
- **Steps:**
  1. Click **Sign out**.
  2. Replay `GET /api/cases` with the copied cookie.
- **Expected:** The replay is 401. The cookie is cleared or the JWT is rejected. A second tab that was open is bounced to `/login` on the next navigation.
- **Automation:** `e2e/security/session.spec.ts`

### SEC-CSRF-001 — Cross-origin mutation is rejected

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Signed-in cookie. A page on `http://evil.example` is simulated with `Origin` and `Referer`.
- **Steps:**
  1. `POST /api/cases` with `Origin: http://evil.example` and the victim cookie, JSON body for a case `CSRF-<timestamp>`.
  2. `POST /api/roles` the same way.
  3. `POST /api/cases` with `Origin: http://127.0.0.1:4317` and the same cookie.
- **Expected:** Steps 1 and 2 are 403 and do not create the case or role. Step 3 succeeds (or 400 on a validation error, not a CSRF error). A bearer token without a cookie is not subject to cookie CSRF; it is still scoped by the token.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-REDIR-001 — Login callbackUrl open redirect

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Logged out.
- **Steps:** Sign in from each URL and record the final origin:
  1. `/login?callbackUrl=/cases`
  2. `/login?callbackUrl=https://evil.example/phish`
  3. `/login?callbackUrl=//evil.example/phish`
  4. `/login?callbackUrl=/\evil`
  5. `/login?callbackUrl=/%0d%0aLocation:%20https://evil.example`
- **Expected:** 1 ends on this host at `/cases`. 2–5 end on this host at `/`. No response has `Location: https://evil.example` or a CRLF-injected header.
- **Automation:** `e2e/security/redirect.spec.ts`

### SEC-XSS-001 — Stored XSS in case fields

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin.
- **Steps:**
  1. Create a case titled `<img src=x onerror=alert(1)>` with key `XSS-<timestamp>`.
  2. Set a step action to `<script>alert(1)</script>`, a comment to `<svg onload=alert(1)>`, and a custom field to `"><script>alert(1)</script>`.
  3. Open the cases table, the case editor, the run executor (include the case in a run), and the report for that run.
- **Expected:** The strings render as text. No dialog fires. `page.on('dialog')` stays empty. The DOM does not contain an `img` whose `onerror` is that payload or a live `script` element from the payload. React text nodes are the expected encoding.
- **Automation:** `e2e/security/xss.spec.ts`

### SEC-XSS-002 — XSS via import and JUnit messages

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin. A CSV row and a JUnit `failure` message containing `<script>alert("junit")</script>`.
- **Steps:**
  1. Import the CSV through `/cases/import`.
  2. Submit the JUnit through `POST /api/ci/junit`.
  3. Open the case, `/automation`, `/triage`, and the run.
- **Expected:** The message is visible as text. No script runs. Triage grouping still works on the raw message.
- **Automation:** `e2e/security/xss.spec.ts`

### SEC-XSS-003 — Share, report, and triage render inert HTML

- **Priority:** P0
- **Area:** Security
- **Preconditions:** The payload case from [SEC-XSS-001](#sec-xss-001--stored-xss-in-case-fields) is on a report that has a share token.
- **Steps:**
  1. Open `/reports/<id>` as admin.
  2. Open `/share/reports/<token>` with no session.
  3. Open `/triage` if the failure message includes the payload.
- **Expected:** Same as SEC-XSS-001: inert text, including for the anonymous share viewer. View source shows escaped entities or text nodes, not raw tags in an HTML execution context.
- **Automation:** `e2e/security/xss.spec.ts`

### SEC-CSV-001 — CSV formula injection in exports

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin. A case titled `=cmd|' /C calc'!A0` and another titled `=HYPERLINK("http://evil.example","x")`. Include them in a run and export.
- **Steps:**
  1. **Export CSV** from cases.
  2. `GET /api/reports/<id>/export?format=csv`.
  3. Milestone export if it includes case titles.
- **Expected:** Cells that start with `=`, `+`, `-`, or `@` are prefixed (tab, apostrophe, or similar) so a spreadsheet does not execute them. The original title is still recoverable. The file is not a binary that launches a process.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-INJ-001 — Query language injection

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Read token or admin session. Case count noted.
- **Steps:** `POST /api/query` with each DSL:
  1. `requirements where key = "' OR 1=1 --"`
  2. `intents where title = "\"; drop table cases; --"`
  3. `executions where status = failed union select password from users`
  4. A 50 KB filter value.
- **Expected:** 400 on parse failure, or 200 with zero rows that were not real matches. Case count is unchanged. The response does not include password hashes, `AUTH_SECRET`, or rows from Foreign Project. No 500 with a SQL stack that includes the raw concatenation of the user string into SQL. The compiler parameterizes values (`src/lib/query-compile.ts`).
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-INJ-002 — Search and filter injection

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin session.
- **Steps:**
  1. `GET /api/search?q=' OR 1=1 --`
  2. `GET /api/cases` with filter query parameters set to `' OR ''='` and a status of `ready';drop table cases;--`.
  3. Cases search box: type `%` and `_`.
- **Expected:** No extra rows from other projects. Tables still exist afterward. Wildcard characters are literals or documented LIKE escapes, not errors. Status 400 on an unknown filter, not 500.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-XXE-001 — TestRail XML rejects XXE

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin. A throwaway project.
- **Steps:**
  1. `POST /api/import/preview` with provider `testrail` and content:
     `<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><suite><name>&xxe;</name></suite>`
  2. Repeat with an external entity pointing at `http://169.254.169.254/latest/meta-data/`.
- **Expected:** 400. The response body does not contain `/etc/passwd` contents or cloud metadata. No case is created. The XML parser does not resolve entities (node limit and entity rules in `src/lib/import/xml.ts`).
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-XXE-002 — JUnit billion laughs and XXE

- **Priority:** P0
- **Area:** Security
- **Preconditions:** `topo_e2e_ci_token`.
- **Steps:**
  1. `POST /api/ci/junit` with a JUnit document that declares a billion-laughs entity expansion (nested entities) inside a `<failure>` or the XML prolog. Keep the payload under a few hundred KB on disk so the expansion, not the upload, is the attack.
  2. `POST /api/ci/junit` with a `SYSTEM` entity in the XML.
  3. Submit the legitimate `fixtures/junit/smoke.xml` afterward.
- **Expected:** Steps 1 and 2 are 400 or 413. Memory and response time stay bounded (the request returns; the process does not peg a core for a minute). Step 3 still ingests. Response bodies do not echo expanded entity text.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-ATT-001 — Attachment id path traversal

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin. One real attachment id.
- **Steps:**
  1. `GET /api/attachments/../.env.local`
  2. `GET /api/attachments/%2e%2e%2f%2e%2e%2fetc%2fpasswd`
  3. `GET /api/attachments/<real-id>/../../.env.local`
- **Expected:** 400 or 404. The body is not `.env.local` and not `/etc/passwd`. The real id still downloads.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-ATT-002 — Filename path traversal

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin. A result id.
- **Steps:**
  1. Upload with filename `../../../../tmp/topology-pwn.txt` and body `pwned`.
  2. Upload with filename `..\..\windows.ini`.
  3. Look on disk under `ATTACHMENTS_DIR` and outside it.
- **Expected:** The stored name is sanitized (`sanitizeFilename`). No file is written outside `ATTACHMENTS_DIR`. Download name is a basename, not a path.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-ATT-003 — Content-Type and Content-Disposition

- **Priority:** P0
- **Area:** Security
- **Preconditions:** A stored PNG attachment.
- **Steps:**
  1. `GET /api/attachments/<id>` and read headers.
  2. Upload a file named `note.txt` with body `hello`.
- **Expected:** `Content-Disposition` is `attachment` (not `inline`) so the browser downloads. `Content-Type` is a specific type or `application/octet-stream`, not `text/html`. `X-Content-Type-Options: nosniff` is present on this response (also asserted globally in [SEC-HEADERS-001](#sec-headers-001--security-headers-are-present)).
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-ATT-004 — Oversized upload

- **Priority:** P1
- **Area:** Security
- **Preconditions:** Admin.
- **Steps:**
  1. Upload 10 MB + 1 byte to `POST /api/results/<id>/attachments`.
  2. Import a body larger than 8 MB (`MAX_CONTENT_CHARS` in `src/lib/import/request.ts`) to `POST /api/import/preview`.
- **Expected:** Both are rejected (413 or 400) with an error. Disk usage under `data/attachments` does not grow by the rejected size. The app stays up.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-ATT-005 — Disguised HTML and SVG uploads

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin.
- **Steps:**
  1. Upload `photo.png` whose bytes are `<html><script>alert(1)</script></html>`.
  2. Upload `icon.svg` containing `<script>alert(1)</script>`.
  3. Download each and open the download URL directly in the browser.
- **Expected:** The response is an attachment, not a rendered page. Navigating to the URL does not execute script (nosniff plus attachment disposition, or the type is rejected at upload). SVG with script is rejected or served as an attachment with a non-renderable type.
- **Automation:** `e2e/security/attachments.spec.ts`

### SEC-HOOK-001 — Unsigned GitHub webhook fails closed

- **Priority:** P0
- **Area:** Security
- **Preconditions:** `TOPOLOGY_GITHUB_WEBHOOK_SECRET` unset, and the Harbor repository row has no `webhook_secret`. Know the Harbor project id.
- **Steps:**
  1. `POST /api/webhooks/github?workspaceId=<harbor-project-uuid>` with header `X-GitHub-Event: push` and a small push JSON, and no `X-Hub-Signature-256`.
  2. Repeat with a repository secret unset and the env secret unset.
- **Expected:** 401 and body error `Webhook secret is not configured` or `Missing X-Hub-Signature-256`. No commit row is inserted. Missing `workspaceId` is 400 before the signature check; include the id so this case actually tests the signature.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-HOOK-002 — Bad GitHub signature

- **Priority:** P0
- **Area:** Security
- **Preconditions:** `TOPOLOGY_GITHUB_WEBHOOK_SECRET=test-secret` or a repository `webhook_secret`.
- **Steps:**
  1. POST a valid-looking push body with `X-Hub-Signature-256: sha256=deadbeef`.
  2. POST the same body with a correct HMAC using a different secret.
  3. POST with the correct HMAC of the raw body.
- **Expected:** Steps 1 and 2 are 401 `Invalid webhook signature`. The body is hashed as the raw bytes, not re-serialized JSON. Step 3 is accepted (200) and may create a commit. A wrong workspace id does not verify against another workspace's secret and then write there.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-HOOK-003 — Outbound webhook HMAC

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin. A local receiver (for example `http://127.0.0.1` is refused — use a public-looking host the test resolves to the receiver via an allowlisted test double, or run the receiver on a non-loopback address the SSRF check permits). Secret `hook-secret-<timestamp>`. Subscribe to `run.completed`.
- **Steps:**
  1. Complete a run.
  2. Read the receiver's request headers and raw body.
- **Expected:** Header `X-Topology-Signature` is `sha256=` plus HMAC-SHA256 of the raw body using the endpoint secret. Recomputing the HMAC matches. The JSON has `id`, `event`, `createdAt`, and `data`. `event` is `run.completed`. The secret is not in the payload. Loopback URLs are refused in [SEC-SSRF-001](#sec-ssrf-001--webhook-ssrf); this case uses an allowed URL.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-SSRF-001 — Webhook URLs block loopback and metadata

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin.
- **Steps:** `POST /api/webhooks` with each URL:
  1. `http://127.0.0.1:9/hook`
  2. `http://169.254.169.254/latest/meta-data/`
  3. `http://[::1]/hook`
  4. `http://10.0.0.5/hook`
  5. A URL that 302-redirects to `http://127.0.0.1/`
- **Expected:** Each create or delivery attempt is refused. No TCP connection to those addresses (watch with a listener on 127.0.0.1:9). DNS rebinding to a private address is refused at connect time. Redirects are not followed.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-SSRF-002 — Import and AI base URLs block private hosts

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin.
- **Steps:**
  1. `POST /api/import/preview` with TestRail `api.baseUrl` `http://127.0.0.1:9` and `http://169.254.169.254/`.
  2. The same for a Qase base URL and a Zephyr base URL.
  3. `PUT /api/ai/provider` with `TOPOLOGY_AI_BASE_URL` equivalent `http://169.254.169.254/` and a fake key.
- **Expected:** All refused. The fake key is not stored. No request hits the listener. Xray has no API mode; do not add one.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-SHARE-001 — Share token entropy and revocation

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin. A report id.
- **Steps:**
  1. Create two share tokens back to back.
  2. Compare length and contents.
  3. Revoke the first. Request it anonymously.
  4. Confirm the second still works.
- **Expected:** Tokens differ, are at least 128 bits of randomness (22+ unguessable characters), and are not sequential integers. Revocation affects only the revoked token. Timing of a missing token and a revoked token does not leak a valid prefix (same status class).
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-SHARE-002 — Invite cannot be reused or raised

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin invites `raise-<timestamp>@topology.local` as Viewer.
- **Steps:**
  1. Accept the invite as that email.
  2. POST the same token again with a body that says `role: admin` or `actions: ["roles.manage"]`.
  3. As the invited user, `POST /api/roles`.
- **Expected:** Step 2 does not change the role. Step 3 is 403. The token cannot be replayed by a different email. The invite URL does not grant `members.invite`.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-RATE-001 — Login rate limit window

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Clean `login_rate_limits` for `viewer@topology.local` and the test IP. Limits: 5 attempts, 15 minute window, 15 minute lock (`src/lib/login-rate-limit.ts`).
- **Steps:**
  1. Fail four sign-ins. Succeed on the fifth with `topology-viewer` before a fifth failure.
  2. Reset by using a fresh identifier: fail five times as `member@topology.local` from this IP.
  3. From a second IP, sign in as member with the correct password while the first IP is locked.
  4. Advance time 15 minutes (or update `locked_until`) and sign in on the first IP.
- **Expected:** Step 1 succeeds (the counter is failures). Step 2 locks. Step 3 succeeds (the key is email+IP). Step 4 succeeds and the counter starts over. The lock response does not include the password or a session cookie.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-SECRET-001 — Secrets are absent from the client bundle

- **Priority:** P0
- **Area:** Security
- **Preconditions:** `npm run build` with dummy but recognizable secrets in the environment: `AUTH_SECRET=secret-auth-marker`, `AUTH_GITHUB_SECRET=secret-github-marker`, `JIRA_API_TOKEN=secret-jira-marker`, `TOPOLOGY_AI_API_KEY=secret-ai-marker`, `TOPOLOGY_GITHUB_WEBHOOK_SECRET=secret-hook-marker`.
- **Steps:**
  1. Search `.next/static` and the client chunks for each marker and for `topo_e2e_`.
  2. Open `/login` and `/settings` view-source and the loaded JS.
- **Expected:** None of the markers appear. `topo_e2e_read_token` and similar plaintext tokens do not appear. `AUTH_SECRET` does not appear. A hit is S0. The test must fail the process, not print a warning.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-SECRET-002 — Secrets are absent from API JSON and the audit log

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Admin. Tokens and a webhook exist.
- **Steps:**
  1. `GET /api/settings`, `GET /api/tokens`, `GET /api/webhooks`, `GET /api/ai/provider`, `GET /api/audit`, `GET /api/health`.
  2. Search the bodies for `AUTH_SECRET`, the webhook secret, the AI key, and the full token string created in [FN-SET-006](#fn-set-006--create-and-revoke-an-api-token).
- **Expected:** No secret material. Health is a status, not a config dump. Audit metadata may include ids and actions, not secrets. Token list may include a non-secret prefix.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-SECRET-003 — Demo seed refuses production

- **Priority:** P0
- **Area:** Security
- **Preconditions:** `NODE_ENV=production`. Database reachable.
- **Steps:**
  1. `NODE_ENV=production npm run db:seed` without `TOPOLOGY_ALLOW_DEMO_SEED`.
  2. Repeat with `TOPOLOGY_ALLOW_DEMO_SEED=1` on a disposable database.
  3. Confirm the production image entrypoint does not set that flag (read `docker-compose.prod.yml` and the Dockerfile).
- **Expected:** Step 1 exits non-zero and does not insert `demo@topology.local`. Step 2 is the explicit override and may seed; it must not be the default in Compose. The image runs migrations on start and does not seed demo data.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-HEADERS-001 — Security headers are present

- **Priority:** P0
- **Area:** Security
- **Preconditions:** App running. For HSTS, an HTTPS origin (production Compose behind TLS, or a TLS terminator). HTTP localhost is not an HSTS pass.
- **Steps:**
  1. `GET /login`, `GET /`, and `GET /api/health`. Record response headers.
  2. On the HTTPS origin, repeat `GET /login`.
- **Expected:** Every HTML and API response must include the following baseline. Implemented in next.config.ts and the runtime HTTPS-origin proxy policy; verify over real HTTP/TLS rather than inferring a pass from configuration:
  - **Content-Security-Policy** with a restrictive `default-src` and `frame-ancestors` (or `frame-ancestors 'none'`).
  - **X-Frame-Options** (`DENY` or `SAMEORIGIN`) or CSP `frame-ancestors` covering the same threat. At least one of the two mechanisms must be present; shipping neither is this defect.
  - **X-Content-Type-Options:** `nosniff`.
  - **Referrer-Policy:** `no-referrer` or `strict-origin-when-cross-origin` (or stricter).
  - **Strict-Transport-Security** on the HTTPS origin, with a max-age of at least 15552000.
- **Defect rule:** File one defect per missing header, severity S1, case id `SEC-HEADERS-001`. Record the defect at release time. Do not mark the case skipped, xfailed, or optional. Do not describe the headers as already implemented, and do not claim the automated suite currently fails CI because a header is missing. Likely implementation site: `headers()` in `next.config.ts`, or `src/middleware.ts`. See [OPS-MW-001](#ops-mw-001--next-middleware-convention).
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-DEPS-001 — Production dependency audit

- **Priority:** P0
- **Area:** Security
- **Preconditions:** Lockfile installed (`npm ci`).
- **Steps:**
  1. Run `npm audit --omit=dev --json`.
  2. Fail the command if any advisory is high or critical.
- **Expected:** Exit 0, or each high/critical advisory has a written defect and a waiver that names the advisory id. Moderate and low are P2 notes. Do not use `--force` to silence the audit.
- **Automation:** `tests/integration/security.integration.test.ts`

### SEC-ZAP-001 — OWASP ZAP baseline

- **Priority:** P1
- **Area:** Security
- **Manual only:** Yes. Nightly or pre-release. Not part of the inner Playwright loop.
- **Preconditions:** App running with the E2E seed. ZAP installed locally or via the `zaproxy/zap-stable` container. Tester signed in once so a context can be exported, plus an anonymous spider.
- **Steps:**
  1. `docker run --rm -t zaproxy/zap-stable zap-baseline.py -t http://host.docker.internal:4317` (or the equivalent against `127.0.0.1:4317` from the host).
  2. Review alerts. Re-spider `/login`, `/cases`, `/runs/<id>`, `/settings`, and a share URL.
  3. Attach the HTML report to the release notes.
- **Expected:** No high-confidence High alerts on the unauthenticated surface. Medium alerts are defects at S2 unless they duplicate [SEC-HEADERS-001](#sec-headers-001--security-headers-are-present) (headers, CSP). Do not ignore a ZAP header finding because that defect was recorded; both stay visible.
- **Automation:** Manual checklist [ZAP](#zap-baseline). A nightly job may wrap the same command; a missing nightly job does not pass this case.

### Accessibility

Target: WCAG 2.2 level AA. Axe tags: `wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`. Automation: `e2e/a11y/*.spec.ts`, tagged `@a11y`, so the viewport projects run them too. Serious and critical axe violations fail the case. Moderate violations are P1 defects.

Routes that must be scanned with the quality graph toggle on, as admin, in both themes:

`/`, `/cases`, `/plans`, `/runs`, `/automation`, `/triage`, `/reports`, `/settings`, `/intents`, `/impact`, `/milestones`, `/releases`, `/releases/compare`, `/journeys`, `/requirements`, `/risks`, `/components`, `/proposals`, `/cases/import`, `/runs/new`, and one `/runs/<id>`, one `/cases/<key>`, one `/plans/<id>`, one `/reports/<id>`.

Also scan `/login` logged out.

### A11Y-AXE-001 — Axe on every nav route in the light theme

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Admin, quality graph on, **Color theme** Light. `@axe-core/playwright` builder with the tags above.
- **Steps:**
  1. Visit each route in the list.
  2. Run axe after the main heading is visible.
- **Expected:** Zero serious or critical violations on each URL. Attach the node snapshots to the failure. Navigation is the landmark named **Primary** (`aria-label="Primary"`).
- **Automation:** `e2e/a11y/axe-routes.spec.ts` (`@a11y`)

### A11Y-AXE-002 — Axe on every nav route in the dark theme

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Same as A11Y-AXE-001 with theme Dark.
- **Steps:** Repeat the route list.
- **Expected:** Zero serious or critical violations. Contrast failures that appear only in dark theme still fail the release.
- **Automation:** `e2e/a11y/axe-routes.spec.ts` (`@a11y`)

### A11Y-AXE-003 — Axe on dialogs

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Admin, light theme, on `/cases`.
- **Steps:** Run axe while each of these is open:
  1. Create-case dialog (**New case** or `/cases?new=1`).
  2. Confirm delete (open **Delete \<key\>** so the confirm control **Delete case** is visible).
  3. Command palette (**Search ⌘K**).
  4. Shortcut cheat sheet (button **Keyboard shortcuts**, or `?`).
- **Expected:** Zero serious or critical violations inside the dialog, including the page behind it if it is not hidden from the accessibility tree. Each dialog has an accessible name.
- **Automation:** `e2e/a11y/axe-states.spec.ts` (`@a11y`)

### A11Y-AXE-004 — Empty, error, and loading states

- **Priority:** P1
- **Area:** Accessibility
- **Preconditions:** Admin.
- **Steps:**
  1. Empty project: `/cases` shows the first-case empty state. Run axe.
  2. No project: **No project selected**. Run axe.
  3. Force a loading state (throttle network, open a case) and axe the skeleton (`aria-busy="true"`, **Loading case**).
  4. Force `cases/error.tsx`, `runs/[id]/error.tsx`, and `reports/error.tsx` (route abort or a thrown load). Axe the alert.
- **Expected:** No serious or critical violations. Error regions are `role="alert"` and expose **Try again**. Loading regions expose a busy state and are not a blank page with no name.
- **Automation:** `e2e/a11y/axe-states.spec.ts` (`@a11y`)

### A11Y-KEY-001 — Keyboard-only login, case, run, and executor

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Logged out. Keyboard only. No pointer events.
- **Steps:**
  1. Tab to Email, type `demo@topology.local`, tab to Password, type `topology-demo`, tab to **Sign in with email**, press Enter.
  2. Tab to **New case** or press `C` on `/cases` (focus not in a field). Create `KEY-<timestamp>` using only Tab and Enter.
  3. Open `/runs/new`, start a run that includes that case, using Tab, Space, and Enter.
  4. On `/runs/<id>`, press `P`, then `F`, then `B`, then `S` on four results (or the same result in sequence if only one case exists: P then F).
- **Expected:** Every step completes without a mouse. Focus is always visible (see the next case). The run shows the statuses that were keyed.
- **Automation:** `e2e/a11y/keyboard.spec.ts` (`@a11y`)

### A11Y-KEY-002 — Focus is visible

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Admin. Light and dark.
- **Steps:**
  1. Tab from the top of `/` through the sidebar, **Search ⌘K**, **Keyboard shortcuts**, and **Sign out**.
  2. Tab through the cases table and a dialog.
- **Expected:** The focused element has a visible outline or other indicator with contrast at least 3:1 against adjacent colors, in both themes. Focus is not suppressed by `outline: none` without a replacement. Check at 1440 and at mobile-390 (drawer closed and open).
- **Automation:** `e2e/a11y/keyboard.spec.ts` (`@a11y`)

### A11Y-KEY-003 — Focus is trapped and restored in dialogs

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Admin on `/cases`.
- **Steps:**
  1. Note the focused element. Open **New case**.
  2. Tab past the last control and Shift-Tab past the first.
  3. Press Escape.
  4. Repeat for the command palette and the shortcut sheet.
- **Expected:** Tab cycles inside the dialog. Focus does not land on the page behind. Escape closes it and returns focus to the control that opened it (or the previously focused element).
- **Automation:** `e2e/a11y/keyboard.spec.ts` (`@a11y`)

### A11Y-KEY-004 — Skip link and landmarks

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Admin on `/`.
- **Steps:**
  1. Load `/` and press Tab once.
  2. Inspect landmarks: navigation **Primary**, main, and the guided region when it is present.
- **Expected:** The first Tab stop is a skip link that moves focus to the main content, or the main landmark is the first stop after a skip. `getByRole('navigation', { name: 'Primary' })` matches one sidebar nav. There is one `h1`. Heading levels do not skip (no `h3` without an `h2` on the same page). Repeat the heading check on `/cases`, `/runs/<id>`, and `/settings`.
- **Automation:** `e2e/a11y/keyboard.spec.ts` (`@a11y`)

### A11Y-KEY-005 — Shortcuts do not fire while typing

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Admin on `/cases` and on `/runs/<id>`.
- **Steps:**
  1. Focus **Search cases**. Type `g c j k x e p s ?`.
  2. Focus the case title field. Type `c`.
  3. On the run, focus notes. Type `p f b s a`.
  4. Focus the page body (not a field). Press `?`, then Escape. Press `G` then `C`.
- **Expected:** Steps 1–3 do not navigate, do not toggle selection, do not open the cheat sheet, and do not change result status. The characters appear in the field. Step 4 opens the cheat sheet, Escape closes it, and `G` then `C` navigates to `/cases`. Escape from inside a field still closes an open palette.
- **Automation:** `e2e/a11y/keyboard.spec.ts` (`@a11y`)

### A11Y-SEM-001 — Landmarks and heading order

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Admin, quality graph on.
- **Steps:**
  1. On each primary route, collect `h1`–`h3` text in DOM order.
  2. Confirm the sidebar `nav` name is **Primary** and the folder tree `nav` name is **Folders** on `/cases`.
- **Expected:** One `h1` per page. No skipped levels. The two navs have different names. Buttons that are icon-only have accessible names (**Open sidebar**, **Close sidebar**, **Close menu**, **Sign out**, **Search ⌘K**, **Keyboard shortcuts**).
- **Automation:** `e2e/a11y/semantics.spec.ts` (`@a11y`)

### A11Y-SEM-002 — Labels and errors announced

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Logged out, then admin.
- **Steps:**
  1. On `/login`, confirm inputs are labelled **Email** and **Password**. Submit empty. Read the alert.
  2. On **New case**, submit without a title.
  3. On import, submit a bad file and read the error.
- **Expected:** Every input has a label associated by `for`/`id` or an `aria-label`. Errors are in `role="alert"` or `aria-live` so a screen reader announces them without moving focus by surprise. The login error is the same node as `role="alert"` in the form.
- **Automation:** `e2e/a11y/semantics.spec.ts` (`@a11y`)

### A11Y-SEM-003 — Status is not color alone

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** A run with Passed, Failed, Blocked, and Skipped results. Hub milestone in a known state.
- **Steps:**
  1. Read the result controls and chips.
  2. Read the milestone Go / At risk / No go chip.
  3. In axe and by inspection, confirm the text is present.
- **Expected:** Visible text (or a visually hidden text node) carries the status. The accessible name includes the status word. A green/red circle without text fails the case.
- **Automation:** `e2e/a11y/semantics.spec.ts` (`@a11y`)

### A11Y-SEM-004 — Live run updates are polite

- **Priority:** P1
- **Area:** Accessibility
- **Preconditions:** Two contexts. Context B has the run open.
- **Steps:**
  1. Inspect the results list for `aria-live="polite"` (or a status region with that live setting).
  2. In context A, mark a case Failed.
  3. Observe the live region in B.
- **Expected:** The update is announced politely and does not use `assertive` for routine status changes. The text of the announcement includes the case key and the new status. There is no focus jump.
- **Automation:** `e2e/a11y/semantics.spec.ts` (`@a11y`)

### A11Y-REFLOW-001 — 320 px width has no horizontal scroll

- **Priority:** P0
- **Area:** Accessibility
- **Preconditions:** Admin. Viewport 320×640. This is narrower than the mobile-390 project; set it explicitly.
- **Steps:**
  1. Open `/`, `/cases`, `/runs/<id>`, `/settings`, `/login`.
  2. For each, compare `document.documentElement.scrollWidth` and `clientWidth`.
  3. Open **New case** and the command palette at 320 px.
- **Expected:** `scrollWidth <= clientWidth + 1` on each page. Dialogs fit ([RESP-DLG-001](#resp-dlg-001--dialogs-fit-the-viewport)). Text does not overlap. This is the WCAG 1.4.10 reflow check.
- **Automation:** `e2e/a11y/reflow.spec.ts` (`@a11y`)

### A11Y-REFLOW-002 — Text spacing override

- **Priority:** P1
- **Area:** Accessibility
- **Preconditions:** Admin at 1440 and at 320.
- **Steps:**
  1. Apply the WCAG 1.4.12 spacing override (line height 1.5, letter spacing 0.12em, word spacing 0.16em, paragraph spacing 2em) via a style element.
  2. Open `/cases` and `/runs/<id>`.
- **Expected:** No clipped labels, no overlapping buttons, no horizontal scroll introduced beyond [A11Y-REFLOW-001](#a11y-reflow-001--320-px-width-has-no-horizontal-scroll). **Passed** / **Failed** remain readable.
- **Automation:** `e2e/a11y/reflow.spec.ts` (`@a11y`)

### A11Y-REFLOW-003 — Reduced motion

- **Priority:** P1
- **Area:** Accessibility
- **Preconditions:** `prefers-reduced-motion: reduce` emulated. Admin.
- **Steps:**
  1. Open `/login` and `/`.
  2. Open the command palette and a case panel.
  3. Inspect computed `animation` and `transition` on the login motion wrapper and palette.
- **Expected:** Entrance motion that `login-form` gates with `reduceMotion` does not run (the login block does not animate `y` from 12). Non-essential transitions are disabled or under 0.01s. Focus and hover still work. The page is usable if animations never start.
- **Automation:** `e2e/a11y/reflow.spec.ts` (`@a11y`)

### A11Y-SR-001 — VoiceOver on login, cases, and the run executor

- **Priority:** P0
- **Area:** Accessibility
- **Manual only:** Yes. macOS VoiceOver (Safari is the AT combination Apple documents; for this release run VoiceOver against Chromium as the primary check, and note Safari separately if the tester has it). Firefox/WebKit remain out of the automated gate.
- **Preconditions:** VoiceOver on. E2E seed. Quality graph off to keep the nav short, then repeat the run executor only.
- **Steps:** See [VoiceOver checklist](#voiceover).
- **Expected:** Every item on that checklist is yes, or a written defect cites the checklist line.
- **Automation:** Manual. No Playwright substitute passes this case.

### A11Y-SR-002 — NVDA on login, cases, and the run executor

- **Priority:** P0
- **Area:** Accessibility
- **Manual only:** Yes. Windows, NVDA current, Chrome.
- **Preconditions:** Same seed. Chrome. NVDA in focus mode and browse mode as the checklist says.
- **Steps:** See [NVDA checklist](#nvda).
- **Expected:** Every item is yes, or a written defect cites the line.
- **Automation:** Manual. No Playwright substitute passes this case.

### UI and UX

Automation: `e2e/ux/*.spec.ts`.

Palette destinations (`src/lib/nav-diet.ts` `PALETTE_PAGES`): Hub, Test cases, Plans, Test runs, Automation, Triage, Reports, Settings, and, when the quality graph is on, Intents, Impact, Milestones, Releases, Journeys, Requirements, Risks, Components, Proposals, plus Connect.

Shortcuts (`SHORTCUTS` in `src/lib/shortcuts.ts`):

| Keys | Id | Where it applies |
| --- | --- | --- |
| `?` | cheat-sheet | Global |
| `C` | create | Global |
| `Esc` | escape | Global, including inside fields |
| `G` then `C` | go-cases | Global, `/cases` |
| `G` then `R` | go-runs | Global, `/runs` |
| `G` then `P` | go-plans | Global, `/plans` |
| `G` then `T` | go-triage | Global, `/triage` |
| `G` then `H` | go-hub | Global, `/` |
| `J` / `K` | nav-next / nav-prev | Lists |
| `Enter` | open | Lists |
| `X` | select | Lists |
| `Shift+J` / `Shift+K` | extend selection | Cases list only |
| `E` | edit | Cases |
| `S` | status | Cases (not the executor) |
| `P` | priority | Cases (not the executor) |
| `P` / `F` / `B` / `S` | pass / fail / blocked / skipped | Run executor only. `F`, `B` do not fire off the executor. |
| `A` | assign | Run executor only |

`G` chords time out after 1000 ms.

### UX-PAL-001 — Palette reaches every destination

- **Priority:** P0
- **Area:** UX
- **Preconditions:** Admin. Quality graph on.
- **Steps:**
  1. Press Ctrl+K or Meta+K, or click **Search ⌘K**.
  2. For each palette label, type the label and press Enter.
- **Expected:** Each entry navigates to the href in `PALETTE_PAGES`, including `/connect` which lands on Settings → Integrations → connections. Escape closes the palette without navigating.
- **Automation:** `e2e/ux/palette.spec.ts`

### UX-PAL-002 — Palette actions

- **Priority:** P0
- **Area:** UX
- **Preconditions:** Admin on `/cases` with one case focused or selected.
- **Steps:**
  1. Open the palette. Run **Create** (or the create action) and confirm a case draft opens.
  2. Run **Start run**.
  3. With a case selected, run **Start run from N selected** or **Start run with \<key\>**.
  4. Run **Import cases**.
  5. Run **Import CI**.
  6. Run the file-an-issue action if it is listed.
- **Expected:** Create opens the new-case UI. Start run opens `/runs/new` with the selection. **Import cases** opens `/cases/import`. **Import CI** opens the CI settings anchor. A viewer session does not show create or start-run actions that the server will reject; if it shows them, the follow-through is a 403 with the UI rolled back, and that is a P1 defect (the action should be omitted).
- **Automation:** `e2e/ux/palette.spec.ts`

### UX-PAL-003 — Palette respects the quality graph toggle

- **Priority:** P1
- **Area:** UX
- **Preconditions:** Admin.
- **Steps:**
  1. Toggle the quality graph off. Open the palette. Search `Impact` and `Milestones`.
  2. Toggle it on. Search again.
- **Expected:** Off: those entries are absent, and Hub, Plans, and Settings remain. On: Impact and Milestones are present. This matches `visiblePalettePages`.
- **Automation:** `e2e/ux/palette.spec.ts`

### UX-SHORT-001 — Cheat sheet lists every shortcut

- **Priority:** P0
- **Area:** UX
- **Preconditions:** Admin, focus not in a field.
- **Steps:**
  1. Press `?` or click **Keyboard shortcuts**.
  2. Read every row.
- **Expected:** The sheet lists every row of the shortcut table in this section, including both meanings of `P` and `S` (cases vs executor) and the five `G` chords. Labels match `SHORTCUTS` (`Keyboard shortcuts`, `Create`, `Close panel`, `Go to test cases`, `Go to test runs`, `Go to plans`, `Go to triage`, `Go to hub`, `Next item`, `Previous item`, `Open focused item`, `Toggle selection`, `Extend selection down`, `Extend selection up`, `Edit focused case`, `Status menu`, `Priority menu`, `Pass result`, `Fail result`, `Block result`, `Skip result`, `Focus assignee`). A missing row fails the case.
- **Automation:** `e2e/ux/shortcuts.spec.ts`

### UX-SHORT-002 — Global shortcuts and go-chords

- **Priority:** P0
- **Area:** UX
- **Preconditions:** Admin on `/`.
- **Steps:**
  1. `G` then `C` → `/cases`.
  2. `G` then `R` → `/runs`.
  3. `G` then `P` → `/plans`.
  4. `G` then `T` → `/triage`.
  5. `G` then `H` → `/`.
  6. `G`, wait 1200 ms, then `C`.
  7. `C` on `/cases`.
- **Expected:** 1–5 navigate. Step 6 does not navigate (chord expired) and does not leave a stuck "G" mode; the following `C` is **Create**. Step 7 opens create. Modifier combinations (Ctrl+C, Meta+C) do not trigger create.
- **Automation:** `e2e/ux/shortcuts.spec.ts`

### UX-SHORT-003 — List, case, and selection shortcuts

- **Priority:** P0
- **Area:** UX
- **Preconditions:** Admin on `/cases` with at least three cases. Focus on the list, not the search box.
- **Steps:**
  1. `J` then `J`, then `K`.
  2. `Enter` opens the focused case.
  3. `E` opens edit.
  4. `X` toggles selection. `Shift+J` extends the selection down. `Shift+K` extends up.
  5. `S` opens the status menu. `P` opens the priority menu.
  6. On `/runs` (the list, not an executor URL), press `P` and `F`.
- **Expected:** Movement follows the row order. Enter and `E` open the focused case. Selection matches the keys. Status and priority menus open on the cases workspace. On the runs list, `P` and `F` do not mark a result and do not open the case priority menu (`isRunExecutorPath` is false on `/runs`). `Shift+J` outside `/cases` does nothing.
- **Automation:** `e2e/ux/shortcuts.spec.ts`

### UX-SHORT-004 — Inputs swallow shortcuts

- **Priority:** P0
- **Area:** UX
- **Preconditions:** Admin on `/cases`.
- **Steps:**
  1. Focus **Search cases**. Type `jkgc?x`.
  2. Press Escape while the palette is open and focus is in the palette input.
- **Expected:** The search string is exactly `jkgc?x`. The URL does not change. Escape closes the palette. This duplicates the intent of [A11Y-KEY-005](#a11y-key-005--shortcuts-do-not-fire-while-typing) for the UX suite so a shortcut regression fails even if the a11y job is sharded separately.
- **Automation:** `e2e/ux/shortcuts.spec.ts`

### UX-SHORT-005 — Executor shortcuts and inputs

- **Priority:** P0
- **Area:** UX
- **Preconditions:** Admin on `/runs/<uuid>` with at least two untested cases.
- **Steps:**
  1. With focus on the list, press `P`, `F`, `B`, `S`, then `A`.
  2. Focus the notes field. Press `P`.
  3. Leave the executor (go to `/cases`). Press `F` and `B` and `A`.
- **Expected:** Step 1 sets Passed, Failed, Blocked, Skipped on the advanced cases and moves focus to the assignee control. Step 2 types `p` or leaves notes unchanged without a status change (the key is ignored, not inserted, only if the field consumes it — the status must not change). Step 3 does not create a failure: `fail`, `blocked`, and `assign` are executor-only.
- **Automation:** `e2e/ux/shortcuts.spec.ts`

### UX-OPT-001 — Optimistic update rolls back on 500

- **Priority:** P0
- **Area:** UX
- **Preconditions:** Admin on `/cases`. Playwright `page.route` (or a proxy) returns 500 for `PATCH /api/cases*`.
- **Steps:**
  1. Change a case title optimistically.
  2. Wait for the failed response.
  3. Repeat for a result status on `/runs/<id>` with `PATCH` forced to 500.
- **Expected:** The title and the status return to the server values. An error toast or inline error is visible. The UI does not keep the optimistic value. No duplicate case is created.
- **Automation:** `e2e/ux/optimistic.spec.ts`

### UX-ERR-001 — Error boundaries recover

- **Priority:** P1
- **Area:** UX
- **Preconditions:** Admin. Ability to make the RSC payload fail once (route abort, or a test hook). Boundaries that exist today:
  - `src/app/(app)/(home)/error.tsx`
  - `src/app/(app)/cases/error.tsx`
  - `src/app/(app)/cases/import/error.tsx`
  - `src/app/(app)/plans/error.tsx`
  - `src/app/(app)/runs/[id]/error.tsx`
  - `src/app/(app)/reports/error.tsx`
  - `src/app/(app)/settings/error.tsx`
- **Steps:**
  1. For each route, force the error UI.
  2. Read the heading and click **Try again**.
  3. On the run boundary, also click **Back to runs**.
- **Expected:** Each boundary renders `role="alert"` and **Try again**. The run boundary heading is "This run couldn’t load" and **Back to runs** goes to `/runs`. **Try again** re-fetches and, once the fault is cleared, shows the real page. The rest of the shell (sidebar) stays usable.
- **Automation:** `e2e/ux/errors.spec.ts`

### UX-EMPTY-001 — Empty states are guided

- **Priority:** P1
- **Area:** UX
- **Preconditions:** A new empty project and a project with data.
- **Steps:**
  1. On the empty project, open `/`, `/cases`, `/runs`, `/runs/new`, `/plans`, `/triage`, `/reports`, `/automation`.
  2. On the populated Harbor project, open the same URLs.
- **Expected:** Empty pages name the next action (create a case, start a run, import CI, file an issue) and are not a blank white card. Populated pages show data, not the empty copy. **No project selected** is the state when no project is active, and it is different from an empty project.
- **Automation:** `e2e/ux/empty.spec.ts`

### UX-THEME-001 — Theme persists

- **Priority:** P0
- **Area:** UX
- **Preconditions:** Admin.
- **Steps:**
  1. Set **Color theme** to Dark. Reload.
  2. Set Light. Open a new tab to `/cases`.
  3. Set System. Change the OS or the Playwright color scheme and reload.
  4. Sign out and sign in again.
- **Expected:** Dark and Light stick across reload, new tab, and a new session (`PATCH` preferences and local application). System follows `prefers-color-scheme`. The toggle cycles system, light, and dark. No flash of the opposite theme that leaves the wrong theme in place after hydration.
- **Automation:** `e2e/ux/theme.spec.ts`

### UX-TOAST-001 — Toasts and alerts

- **Priority:** P1
- **Area:** UX
- **Preconditions:** Admin.
- **Steps:**
  1. Toggle **Quality graph** and read the confirmation.
  2. Save a case.
  3. Trigger a failed save (500 from [UX-OPT-001](#ux-opt-001--optimistic-update-rolls-back-on-500)).
  4. Trigger a login error.
- **Expected:** Success feedback is a toast or an equivalent status that does not steal focus. Errors use `role="alert"` or a toast with an assertive/polite live region and stay long enough to read (at least a few seconds, or until dismissed). Two rapid toasts do not permanently cover **Sign out**. Login errors stay inline, not only in a toast that disappears before it can be read.
- **Automation:** `e2e/ux/toasts.spec.ts`

### UX-VIS-001 — Visual baselines at desktop-1440

- **Priority:** P2
- **Area:** UX
- **Preconditions:** Admin. Frozen clock and masked dynamic regions (dates, unread counts, case keys that include timestamps). Both themes.
- **Steps:**
  1. `toHaveScreenshot` on `/`, `/cases`, `/runs`, `/runs/<seeded id>`, `/reports`, `/settings?section=account`, `/login` (logged out).
  2. Repeat in Dark.
- **Expected:** Pixel diff within the project's threshold. Mask the notifications count and any relative time. A baseline update requires a human look at the diff. This case does not block the release.
- **Automation:** `e2e/ux/visual.spec.ts`

### UX-NET-001 — Slow network

- **Priority:** P2
- **Area:** UX
- **Preconditions:** Admin. Playwright network throttling approximating slow 3G (about 400 ms RTT, 400 kbps down).
- **Steps:**
  1. Open `/cases`.
  2. Create a case.
  3. Open a run and mark Passed.
- **Expected:** A loading skeleton or busy state appears (**Loading case** or the table skeleton). The actions complete. No duplicate case from a double submit. Timeouts in the test are raised so slowness is not a false failure.
- **Automation:** `e2e/ux/network.spec.ts`

### UX-NET-002 — Offline mid-action

- **Priority:** P1
- **Area:** UX
- **Preconditions:** Admin on an open case editor with unsaved title `offline-<timestamp>`.
- **Steps:**
  1. `context.setOffline(true)`.
  2. Save.
  3. `setOffline(false)` and save again.
- **Expected:** The failed save shows an error and does not claim success. After reconnect, the save persists and reload shows `offline-<timestamp>`. The app does not wipe the form on the error.
- **Automation:** `e2e/ux/network.spec.ts`

### UX-NET-003 — SSE reconnects after a dropped connection

- **Priority:** P1
- **Area:** UX
- **Preconditions:** Two contexts. Context B is on `/runs/<id>` or `/triage` with `/api/live` open.
- **Steps:**
  1. Abort the SSE connection (block `/api/live` after it starts, or close the server side).
  2. Restore the route.
  3. In context A, mark a result with note `reconn-<timestamp>`.
- **Expected:** Context B reconnects without a manual reload and shows `reconn-<timestamp>`. A visible "reconnecting" state is acceptable. An endless spinner with no reconnect fails the case.
- **Automation:** `e2e/ux/network.spec.ts`

### Responsive

Tagged `@responsive`. Run in `mobile-390`, `tablet-834`, `tablet-1194`, `laptop-1366`, and `desktop-1920`. Critical flows are repeated in full on mobile-390 and tablet-834. Other viewports run the overflow, nav, table, dialog, and target checks.

Primary routes for overflow: `/`, `/cases`, `/plans`, `/runs`, `/runs/<id>`, `/automation`, `/triage`, `/reports`, `/settings`, `/login`.

### RESP-OVF-001 — No horizontal overflow on primary routes

- **Priority:** P0
- **Area:** Responsive
- **Preconditions:** Admin. Each viewport project.
- **Steps:**
  1. Open each primary route.
  2. Assert `scrollWidth <= clientWidth + 1` on `documentElement`.
- **Expected:** No horizontal page scroll. Tables may scroll inside their own region ([RESP-TBL-001](#resp-tbl-001--tables-and-virtual-lists-adapt)). The page itself does not.
- **Automation:** `e2e/responsive/overflow.spec.ts` (`@responsive`)

### RESP-NAV-001 — Nav drawer on mobile and tablet

- **Priority:** P0
- **Area:** Responsive
- **Preconditions:** Admin. Viewports mobile-390 and tablet-834. Also confirm laptop-1366 and desktop-1920 keep the sidebar visible.
- **Steps:**
  1. At 390 and 834, confirm the sidebar is not taking the full content width.
  2. Click **Open sidebar** (or the menu button).
  3. Activate **Test cases**.
  4. Close with **Close sidebar** or **Close menu**, and with Escape.
  5. Open again and Tab through the links, then close.
- **Expected:** The drawer opens and closes. Navigation works. Keyboard can move through the drawer and Escape closes it. Focus returns to the opener. At 1366 and 1920 the persistent sidebar is visible and **Open sidebar** is not the only way to reach links.
- **Automation:** `e2e/responsive/nav.spec.ts` (`@responsive`)

### RESP-TBL-001 — Tables and virtual lists adapt

- **Priority:** P1
- **Area:** Responsive
- **Preconditions:** Admin. `/cases` with seeded rows. All five viewports.
- **Steps:**
  1. Scroll the case table vertically.
  2. If the table is wider than the viewport, scroll it inside its scroller, not the document.
  3. Open `/runs/<id>` and scroll the case list.
- **Expected:** Rows remain readable (key and title visible without horizontal page scroll). The virtual window still loads the next rows. No overlapping text.
- **Automation:** `e2e/responsive/tables.spec.ts` (`@responsive`)

### RESP-DLG-001 — Dialogs fit the viewport

- **Priority:** P0
- **Area:** Responsive
- **Preconditions:** All five viewports. Admin.
- **Steps:**
  1. Open **New case**, the delete confirm, the command palette, and **Keyboard shortcuts**.
  2. Measure each dialog's bounding box against the viewport.
- **Expected:** The dialog is fully on screen or scrolls inside itself. Primary actions (**Create**, **Delete case**, close) are reachable without horizontal scroll. At 390 the dialog width is at most the viewport width minus a small margin.
- **Automation:** `e2e/responsive/dialogs.spec.ts` (`@responsive`)

### RESP-TGT-001 — Touch targets are at least 24 by 24

- **Priority:** P0
- **Area:** Responsive
- **Preconditions:** mobile-390 and tablet-834. WCAG 2.5.8 (24×24 CSS pixels).
- **Steps:**
  1. Measure **Open sidebar**, **New case**, result status buttons, **Sign in with email**, palette rows, and **Sign out**.
  2. Include the icon buttons **Keyboard shortcuts** and **Search ⌘K**.
- **Expected:** Each target's border box is at least 24×24, or the spacing to the next target makes the hit area meet 2.5.8. Failures are P0 on the critical controls (sign-in, menu, result status) and P1 on dense table icon buttons if they are below 24 px.
- **Automation:** `e2e/responsive/targets.spec.ts` (`@responsive`)

### RESP-FLOW-001 — Login and hub at mobile-390

- **Priority:** P0
- **Area:** Responsive
- **Preconditions:** Logged out. Project `mobile-390`.
- **Steps:**
  1. Open `/login`. Sign in as admin.
  2. Read the hub. Open **Notifications** and close it.
  3. Open the drawer and go to **Test cases**.
- **Expected:** Login fields stack and submit. Hub content is readable. Drawer navigation works. No horizontal overflow.
- **Automation:** `e2e/responsive/flows-mobile.spec.ts` (`@responsive`)

### RESP-FLOW-002 — Case view and edit at mobile-390

- **Priority:** P0
- **Area:** Responsive
- **Preconditions:** Admin. `mobile-390`.
- **Steps:**
  1. Open `/cases`. Search `Harbor` or a seeded key.
  2. Open a case. Change the title to `Mobile <timestamp>`. Save.
  3. Reload.
- **Expected:** The editor is usable. The new title persists. **Close case editor** is reachable.
- **Automation:** `e2e/responsive/flows-mobile.spec.ts` (`@responsive`)

### RESP-FLOW-003 — Run executor pass and fail at mobile-390

- **Priority:** P0
- **Area:** Responsive
- **Preconditions:** Admin. An in-progress run. `mobile-390`.
- **Steps:**
  1. Open `/runs/<id>`.
  2. Open a case from the list.
  3. Tap **Passed**, go back with **Back to case list**, open another case, tap **Failed**.
- **Expected:** **Back to case list** is visible at this width (`md:hidden` on that control means it shows on mobile). Statuses persist. The status buttons are tappable ([RESP-TGT-001](#resp-tgt-001--touch-targets-are-at-least-24-by-24)).
- **Automation:** `e2e/responsive/flows-mobile.spec.ts` (`@responsive`)

### RESP-FLOW-004 — Report and settings at mobile-390

- **Priority:** P1
- **Area:** Responsive
- **Preconditions:** Admin. `mobile-390`.
- **Steps:**
  1. Open `/reports` and one report.
  2. Open `/settings` and switch Account, Projects, Access, Integrations, Security.
- **Expected:** Charts or totals are readable. Settings nav can be used without horizontal page scroll. Token create controls are reachable.
- **Automation:** `e2e/responsive/flows-mobile.spec.ts` (`@responsive`)

### RESP-FLOW-005 — Critical flows at tablet-834

- **Priority:** P0
- **Area:** Responsive
- **Preconditions:** Admin. Project `tablet-834`.
- **Steps:**
  1. Sign in.
  2. Open the hub, a case, edit the title, open a run, mark Passed and Failed, open a report, open settings.
- **Expected:** Same outcomes as the mobile flow cases. The drawer or the collapsed nav still works by keyboard ([RESP-NAV-001](#resp-nav-001--nav-drawer-on-mobile-and-tablet)).
- **Automation:** `e2e/responsive/flows-tablet.spec.ts` (`@responsive`)

### RESP-ORI-001 — Orientation change on tablet

- **Priority:** P1
- **Area:** Responsive
- **Preconditions:** Start at tablet-834 (portrait). Then resize to tablet-1194 (landscape) without a reload. Admin, run executor open.
- **Steps:**
  1. At 834×1194, open the drawer and a case on the run.
  2. Resize to 1194×834.
  3. Mark the case Passed.
  4. Resize back to 834 wide.
- **Expected:** No horizontal overflow after either resize. The result still saves. The drawer does not stay stuck open over the resized layout. Dialogs that were open are still on screen or closed cleanly.
- **Automation:** `e2e/responsive/orientation.spec.ts` (`@responsive`)

### Integrations

Automation lives under `tests/integration/` (CLI, MCP, reporters, issue providers, webhooks). S3 uses a MinIO container in that suite or `tests/ops/`.

### INT-CLI-001 — junit submit

- **Priority:** P0
- **Area:** Integrations
- **Preconditions:** `TOPOLOGY_URL=http://127.0.0.1:4317`, `TOPOLOGY_API_TOKEN=topo_e2e_ci_token`, Harbor project selected by the token.
- **Steps:**
  1. `npm run topology -- junit submit ./fixtures/junit/smoke.xml --source cli`
  2. `GET /api/ci/runs` and open the new run in the UI.
- **Expected:** Exit 0. JSON includes `ok: true` and a summary. The run is visible in `/automation`. Names match the XML test cases.
- **Automation:** `tests/integration/cli.integration.test.ts`

### INT-CLI-002 — affected

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** A path rule from [FN-QG-004](#fn-qg-004--impact-and-path-rules) or the demo seed's rule. Read or ci-write token (affected requires `read`).
- **Steps:**
  1. `npm run topology -- affected --path src/checkout/cart.ts`
  2. `npm run topology -- affected --paths src/checkout/cart.ts,src/other/file.ts`
- **Expected:** Exit 0. JSON lists the component for the matching path. An unknown path is an empty match, not a crash.
- **Automation:** `tests/integration/cli.integration.test.ts`

### INT-CLI-003 — coverage

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** Read token. Demo quality graph seeded.
- **Steps:**
  1. `npm run topology -- coverage`
  2. `GET /api/coverage` with the same token and compare.
- **Expected:** Exit 0. The CLI prints the coverage JSON (requirements, risks, automation, gaps). It matches the API. Custom role's session is not involved; the token's project is Harbor.
- **Automation:** `tests/integration/cli.integration.test.ts`

### INT-CLI-004 — merge-local

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** Two JUnit files that share one test name with different results (second file fails a test the first passed).
- **Steps:**
  1. `npm run topology -- junit merge-local <file1> <file2>`
- **Expected:** Exit 0. The later file wins for the shared name. Output is a local merge and does not require the server. A missing file exits non-zero.
- **Automation:** `tests/integration/cli.integration.test.ts`

### INT-CLI-005 — runs create with --pr

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** ci-write token. The product command is `topology runs create --name <name> --pr <n>`, not a separate `create-pr` binary. `--pr` must be a positive integer.
- **Steps:**
  1. `npm run topology -- runs create --name "cli-pr-<timestamp>" --source cli --pr 843 --sha abcdef1`
  2. `npm run topology -- runs create --name "bad-pr" --pr 0`
  3. `npm run topology -- runs create --name "bad-pr" --pr nope`
- **Expected:** Step 1 exits 0 and the CI run stores PR `843`. Steps 2 and 3 exit non-zero and print `Invalid --pr`. No run is created for the invalid calls.
- **Automation:** `tests/integration/cli.integration.test.ts`

### INT-CLI-006 — Bad token and bad file

- **Priority:** P0
- **Area:** Integrations
- **Preconditions:** Server up.
- **Steps:**
  1. `TOPOLOGY_API_TOKEN=topo_e2e_revoked_token npm run topology -- junit submit ./fixtures/junit/smoke.xml --source cli`
  2. `TOPOLOGY_API_TOKEN=topo_e2e_read_token` with the same command.
  3. `TOPOLOGY_API_TOKEN=topo_e2e_ci_token npm run topology -- junit submit ./fixtures/junit/does-not-exist.xml --source cli`
  4. Unset `TOPOLOGY_API_TOKEN` and run `junit submit` on smoke.xml.
- **Expected:** All four exit non-zero. 1 and 2 do not create a run (401 and 403). 3 reports the missing file. 4 tells the user `TOPOLOGY_API_TOKEN is required`. None of them print a stack that includes `DATABASE_URL`.
- **Automation:** `tests/integration/cli.integration.test.ts`

### INT-MCP-001 — List tools and call each one

- **Priority:** P0
- **Area:** Integrations
- **Preconditions:** `TOPOLOGY_URL` and `TOPOLOGY_API_TOKEN=topo_e2e_agent_token`. MCP server `packages/mcp` (`npm run mcp` or `npx tsx packages/mcp/src/server.ts`).
- **Steps:**
  1. List tools.
  2. Call each tool with a minimal valid argument: `list_cases`, `create_case`, `list_runs`, `create_run`, `list_results`, `record_result`, `whats_pending`, `get_scenario_context`, `list_intents`, `get_test_intent`, `create_test_intent`, `get_coverage`, `get_requirement`, `get_execution_history`, `get_failure_evidence`, `link_automation`, `compare_releases`, `propose_coverage`, `get_affected_tests`, `quality_search`, `search_tests`, `create_issue`, `link_issue`.
- **Expected:** The list matches those names. Each call returns a tool result, not an MCP protocol error. `create_case` creates a Harbor case visible in the UI. `propose_coverage` does not write the graph until a human accepts it on `/proposals`. `record_result` changes the run. Tools that need an id use ids from the previous call in this test.
- **Automation:** `tests/integration/mcp.integration.test.ts`

### INT-MCP-002 — Agent scope is required

- **Priority:** P0
- **Area:** Integrations
- **Preconditions:** MCP pointed at `topo_e2e_read_token`, then `topo_e2e_ci_token`, then `topo_e2e_revoked_token`.
- **Steps:**
  1. Call `list_cases` with the read token.
  2. Call `create_case` with the ci-write token.
  3. Call `list_cases` with the revoked token.
- **Expected:** Read and ci-write are rejected for agent tools (403), because those scopes do not include `agent`. Revoked is 401. No case is created in step 2.
- **Automation:** `tests/integration/mcp.integration.test.ts`

### INT-RPT-001 — Playwright reporter

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** `@topology/playwright` wired to a tiny Playwright project (one passing test, one failing test). `TOPOLOGY_API_TOKEN=topo_e2e_ci_token`.
- **Steps:**
  1. Run that project.
  2. Open `/automation`.
- **Expected:** Both tests appear with the right statuses. The failing test's error text is stored and is inert HTML if it contains markup.
- **Automation:** `tests/integration/reporters.integration.test.ts`

### INT-RPT-002 — Jest reporter

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** `@topology/jest` on a tiny Jest file with one pass and one fail.
- **Steps:**
  1. Run Jest with the Topology reporter.
  2. Open `/automation`.
- **Expected:** Results appear under a Jest source name and match the file. A bad token fails the reporter with a non-zero hint and does not hang the process.
- **Automation:** `tests/integration/reporters.integration.test.ts`

### INT-RPT-003 — Cypress reporter

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** `@topology/cypress` and a tiny Cypress spec if the package ships an example; otherwise a fixture upload through the reporter's upload function.
- **Steps:**
  1. Run the sample and upload.
  2. Confirm rows in `/automation`.
- **Expected:** Passed and failed Cypress tests are listed with titles from the spec. The upload uses `ci-write`.
- **Automation:** `tests/integration/reporters.integration.test.ts`

### INT-RPT-004 — Pytest plugin

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** Python environment with the package installed. Token `topo_e2e_ci_token`.
- **Steps:**
  1. `pytest packages/pytest-topology/tests` with the plugin pointed at `http://127.0.0.1:4317`.
  2. Open `/automation`.
- **Expected:** The pytest tests upload and appear. A failed assertion message is stored as text. The command exits according to pytest's own results, not because the upload crashed a passing suite.
- **Automation:** `tests/integration/reporters.integration.test.ts`

### INT-ISS-001 — Issue provider contracts

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** HTTP mocked. No live Jira, Linear, GitHub, or GitLab credentials required. Package `@topology/issue-providers`.
- **Steps:**
  1. For `jira`, `linear`, `github`, and `gitlab`, call `createIssue`, `getIssue`, `linkExisting`, `updateIssue`, and `transition` against the mock HTTP server.
  2. Confirm `mock` does the same in-process with `TOPOLOGY_ISSUE_PROVIDER=mock`.
- **Expected:** Each method hits the documented URL shape and parses the fixture response. `transition` to done is what a passing retest calls. GitLab works at the package layer. If the hub cannot store `gitlab` on `linked_issues.provider`, file a P1 defect rather than failing the package contract: the enum in the database must accept `gitlab` before the UI offers it. Unknown provider id `acme` throws until registered.
- **Automation:** `tests/integration/issue-providers.integration.test.ts`

### INT-ISS-002 — registerIssueProvider

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** A test process that can import `@topology/issue-providers` and `@topology/plugin-sdk`.
- **Steps:**
  1. `registerIssueProvider("acme", () => provider)` with stubs for all five methods.
  2. `resolveIssueProvider({ provider: "acme" })` and call `createIssue`.
  3. `resolveIssueProvider({ provider: "jira" })` after registering a fake `jira`.
- **Expected:** `acme` resolves to the stub. Built-ins win: `jira` stays the built-in, not the fake. The plugin registry lists the provider as kind `issue`. There is no filesystem plugin loader; registration is in-process only.
- **Automation:** `tests/integration/issue-providers.integration.test.ts`

### INT-HOOK-001 — Outbound events, payload, and signature

- **Priority:** P0
- **Area:** Integrations
- **Preconditions:** A local receiver on an address the SSRF guard allows. Endpoint subscribed to all of `run.completed`, `issue.created`, `intent.stale`, `coverage.dropped`, `proposal.created`. Secret known.
- **Steps:**
  1. Complete a run.
  2. Create a mock issue from a failure.
  3. Create a proposal (`POST /api/proposals` or `propose_coverage`).
  4. Trigger `intent.stale` and `coverage.dropped` the way the app emits them (the test may call the dispatcher directly if the UI has no button).
- **Expected:** Each delivery's raw body verifies with `X-Topology-Signature: sha256=<hmac>`. `event` is one of the five names. Payload includes `id`, `event`, `createdAt`, and `data`. Harbor ids only. A failed signature on the receiver is a product bug.
- **Automation:** `tests/integration/webhooks.integration.test.ts`

### INT-HOOK-002 — Webhook retries

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** Receiver returns 500 twice, then 200.
- **Steps:**
  1. Complete a run.
  2. Count receiver hits and the final status stored on the delivery.
- **Expected:** The app retries the failed deliveries and stops after success. It does not retry forever in the test window. The secret header is present on every attempt. A 404 is not treated as success.
- **Automation:** `tests/integration/webhooks.integration.test.ts`

### INT-S3-001 — MinIO upload and download

- **Priority:** P1
- **Area:** Integrations
- **Preconditions:** MinIO container. `ATTACHMENTS_DRIVER=s3`, `ATTACHMENTS_S3_BUCKET`, `ATTACHMENTS_S3_ENDPOINT`, `ATTACHMENTS_S3_ACCESS_KEY_ID`, `ATTACHMENTS_S3_SECRET_ACCESS_KEY`, `ATTACHMENTS_S3_FORCE_PATH_STYLE=1`, `ATTACHMENTS_S3_REGION=auto`. Restart the app so the driver is S3.
- **Steps:**
  1. Upload a PNG on a result.
  2. Download `GET /api/attachments/<id>`.
  3. Confirm the object exists in the bucket at `storage_key`.
  4. Delete the object from MinIO and download again.
- **Expected:** Bytes match. The object key matches `attachments.storage_key`. After the object is removed, download reports the file missing and does not fall back to `./data/attachments`. Local-driver behavior remains the default when the env is `local`.
- **Automation:** `tests/integration/attachments-s3.integration.test.ts`

### Ops, deploy, and data

Automation: `tests/ops/` except the manual rows called out below.

Journal files:

| Order | Tag |
| --- | --- |
| 0 | `0000_baseline` |
| 1 | `0001_tcm_parity` |
| 2 | `0002_scale` |
| 3 | `0003_quality_graph_pref` |

`src/db/reconcile-unstamped.sql` is for databases that were created before the journal. Do not replay retired pre-journal SQL as if it were the migrator.

### OPS-DOCKER-001 — Image runs as non-root

- **Priority:** P1
- **Area:** Ops
- **Preconditions:** Docker. Dockerfile in the repo.
- **Steps:**
  1. `docker build -t topology:release-test .`
  2. `docker inspect --format '{{.Config.User}}' topology:release-test`
  3. `docker run --rm topology:release-test id` (or `docker compose` exec once the stack is up).
- **Expected:** The user is not root and not uid 0. The process can read the standalone server and write `/data/attachments` (or the configured attachments path) and cannot write `/etc`. A root user fails the case.
- **Automation:** `tests/ops/docker.test.ts`

### OPS-COMPOSE-001 — Production Compose boots and migrates

- **Priority:** P0
- **Area:** Ops
- **Preconditions:** `docker-compose.prod.yml`. `.env.prod` with `AUTH_SECRET`, `AUTH_URL`, and `POSTGRES_PASSWORD`. No `TOPOLOGY_ALLOW_DEMO_SEED`. Fresh volumes.
- **Steps:**
  1. `docker compose -f docker-compose.prod.yml up --build -d`
  2. Wait for the healthcheck.
  3. `GET http://127.0.0.1:4317/api/health` and `GET /health`.
  4. Open `/setup` and create the first admin (production does not seed demo users).
  5. `docker compose -f docker-compose.prod.yml exec` the app process and confirm migrations ran (log line or `__drizzle_migrations` has four rows).
- **Expected:** Health is 200. Postgres is not published on the host port (54329 is the dev Compose file, not prod). The app listens on 4317. Demo login `demo@topology.local` does not exist until someone creates it. A second `up` does not reapply migrations as new work.
- **Automation:** `tests/ops/compose.test.ts`

### OPS-MIG-001 — Fresh database migration

- **Priority:** P0
- **Area:** Ops
- **Preconditions:** Empty Postgres database `topology_fresh`. `DATABASE_URL` pointed at it.
- **Steps:**
  1. `npm run db:migrate`
  2. Query `__drizzle_migrations` and a known table (`cases`, `api_tokens`).
- **Expected:** Exit 0. Journal tags `0000_baseline`, `0001_tcm_parity`, `0002_scale`, and `0003_quality_graph_pref` are applied in order. Tables exist. The command does not call `drizzle-kit push`.
- **Automation:** `tests/ops/migrate.test.ts`

### OPS-MIG-002 — Upgrade from baseline to current

- **Priority:** P0
- **Area:** Ops
- **Preconditions:** A database that has had only `0000_baseline` applied (apply that SQL, stamp only that hash).
- **Steps:**
  1. `npm run db:migrate`
  2. Confirm `0001`, `0002`, and `0003` applied and existing baseline rows remain.
- **Expected:** Upgrade is additive. A row inserted before the upgrade is still there. `0003_quality_graph_pref` adds the preference column or table the app reads for the quality graph toggle. The app boots against the upgraded database.
- **Automation:** `tests/ops/migrate.test.ts`

### OPS-MIG-003 — Second migrate is a no-op

- **Priority:** P0
- **Area:** Ops
- **Preconditions:** Database already at the journal head.
- **Steps:**
  1. `npm run db:migrate`
  2. Run it again.
  3. Compare `__drizzle_migrations` row count.
- **Expected:** Both exit 0. The second run does not duplicate hashes or change schema. Logs say there is nothing to apply.
- **Automation:** `tests/ops/migrate.test.ts`

### OPS-MIG-004 — Reconcile an unstamped database

- **Priority:** P1
- **Area:** Ops
- **Preconditions:** A copy of a database that has the tables but an empty `__drizzle_migrations` (the pre-journal state described in [docs/deploy.md](deploy.md)). `src/db/reconcile-unstamped.sql` available.
- **Steps:**
  1. Run the reconcile SQL as documented.
  2. `npm run db:migrate`
- **Expected:** The migrator does not try to recreate existing tables (no "already exists" failure). After reconcile, the journal matches the schema. If the supported path for a given dump is "new volume, migrate, restore rows" instead of reconcile, follow that path and still end with a booting app and the original case count. Document which path was used in the test log.
- **Automation:** `tests/ops/migrate.test.ts`

### OPS-BAK-001 — Backup and restore round trip

- **Priority:** P0
- **Area:** Ops
- **Manual only:** Yes. Follow [docs/deploy.md](deploy.md). Destructive enough to keep out of the inner CI loop; required before a release tag.
- **Preconditions:** Production Compose (or a staging copy) with one case `BACKUP-<timestamp>`, one attachment, and one run.
- **Steps:**
  1. `docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U topology -d topology -Fc > topology.dump`
  2. Copy the attachments volume (`/data/attachments`) or confirm the S3 keys.
  3. Drop the database contents (or restore into an empty database) and remove one attachment file.
  4. `pg_restore -U topology -d topology --clean --if-exists < topology.dump`
  5. Copy attachment files back. Restore order is database first, then blobs.
  6. Sign in and open the case, the run, and the attachment.
- **Expected:** `BACKUP-<timestamp>` is present. The attachment downloads. A database without blobs shows a clear "file missing" on download, which you should have seen in step 3 before copying blobs back. Blobs without rows are not listed in the UI.
- **Automation:** Manual checklist [Backup and restore](#backup-and-restore).

### OPS-BOOT-001 — Bootstrap seed creates only the admin

- **Priority:** P0
- **Area:** Ops
- **Preconditions:** Empty migrated database.
- **Steps:**
  1. `TOPOLOGY_SEED_MODE=bootstrap npm run db:seed` with `DEMO_USER_EMAIL` and `DEMO_USER_PASSWORD` set.
  2. Sign in as that user.
  3. Open `/cases`.
- **Expected:** One admin user and no demo cases, folders, runs, or milestone. The hub shows **Get started**. No `member@` or `other@` user exists. This mode is what a production-minded bootstrap looks like; the release suite itself uses `TOPOLOGY_SEED_MODE=e2e` on a different database.
- **Automation:** `tests/ops/bootstrap.test.ts`

### OPS-PERF-001 — Cases list p95 under 500 ms at 50k cases

- **Priority:** P1
- **Area:** Ops
- **Preconditions:** `npm run db:perf-fixture` loaded so the project has 50,000 cases. `npm run db:perf-bench` or a timed loop of `GET /api/cases?limit=50` with a warm server (`next start`, not `next dev`). Admin session.
- **Steps:**
  1. Issue 100 authenticated list requests after 10 warm-up requests.
  2. Compute p95 latency on the server side (time to first byte of the JSON).
- **Expected:** p95 under **500 ms**. The payload is a page (limit at most 100), not 50,000 rows. A p95 at or above 500 ms fails the case. Record the actual number in the test output.
- **Automation:** `e2e/performance.spec.ts`

### OPS-PERF-002 — Run executor usable at 5,000 results

- **Priority:** P1
- **Area:** Ops
- **Preconditions:** One run with 5,000 results from the perf fixture.
- **Steps:**
  1. Open `/runs/<id>` in Chromium with a performance trace.
  2. Click **Passed** on the first result.
  3. Scroll to result 2500 and click **Failed**.
- **Expected:** "Usable" means all of: first meaningful paint of the executor under 2 s on the reference machine after the HTML arrives; the status click's API round trip p95 under 500 ms; the main thread does not block for more than 200 ms on the click that selects the next row. The virtual list does not mount 5,000 DOM rows (DOM node count for the list stays in the low hundreds).
- **Automation:** `e2e/performance.spec.ts`

### OPS-PERF-003 — JUnit ingest of 10,000 testcases under 30 s

- **Priority:** P1
- **Area:** Ops
- **Preconditions:** A generated JUnit (or JSON results) document with 10,000 `<testcase>` entries. ci-write token. `next start`.
- **Steps:**
  1. `POST /api/ci/junit` and time the response.
  2. `GET` the run and count results.
- **Expected:** The POST completes in under **30 seconds** and returns success. The run has 10,000 results (or 10,000 deduped names if the generator used unique names). The process does not OOM. A timeout fails the case.
- **Automation:** `e2e/performance.spec.ts`

### OPS-LH-001 — Lighthouse on hub, cases, and a run

- **Priority:** P1
- **Area:** Ops
- **Manual only:** Yes.
- **Preconditions:** Production build (`npm run build && npm run start`) with the E2E seed. Signed-in Chrome profile or a Lighthouse run that can hold the session cookie. Desktop form factor.
- **Steps:**
  1. Lighthouse `/` (hub).
  2. Lighthouse `/cases`.
  3. Lighthouse `/runs/<seeded id>`.
- **Expected:** Performance ≥ 90, Best Practices ≥ 90, Accessibility 100, on each URL. SEO is not a gate. If Accessibility is under 100, the failing audit must also be filed against the matching `A11Y-*` case. Do not average the three pages.
- **Automation:** `e2e/lighthouse.spec.ts`; manual checklist [Lighthouse](#lighthouse) remains available.

### OPS-MW-001 — Auth interceptor uses the installed Next convention

- **Priority:** P1
- **Area:** Ops
- **Preconditions:** Dependencies installed. Auth interception is `src/proxy.ts`, wrapping NextAuth and preserving config.matcher; it also sets runtime-origin HSTS.
- **Steps:**
  1. Read the Next.js docs shipped in this install under `node_modules/next/dist/docs/` for middleware (search for `middleware` and for a renamed convention such as `proxy`).
  2. Confirm `src/proxy.ts` is the file Next is actually executing (request log, or a header the middleware sets).
  3. If the docs mark `middleware.ts` as deprecated or renamed, file a defect. Do not move the file during the test.
- **Expected:** Either the docs still describe `middleware.ts` as the request interceptor and the file runs, or a written defect names the replacement file convention and the release note. A silent ignore is not allowed: Next 16 may deprecate this file, and skipping the check would leave auth unenforced after an upgrade. Tie header work to the same place: if headers are added in middleware, they have to move with it ([SEC-HEADERS-001](#sec-headers-001--security-headers-are-present)).
- **Automation:** `e2e/security/session.spec.ts` and `e2e/security/api.spec.ts`

### OPS-BROW-001 — Chromium-only statement

- **Priority:** P2
- **Area:** Ops
- **Preconditions:** None.
- **Steps:**
  1. Confirm this document's scope says Chromium only and that Firefox and WebKit are a known gap.
  2. Confirm `playwright.config.ts` does not require a Firefox or WebKit project for the release gate.
- **Expected:** The release notes and this plan agree. Adding Firefox later is new work, not a 0.1.x failure.
- **Automation:** `tests/ops/browser-support.test.ts`

## 5. Traceability

| Area | Case IDs | Automation |
| --- | --- | --- |
| Auth and onboarding | FN-AUTH-001 – FN-AUTH-008 | `e2e/functional/auth.spec.ts` |
| Hub | FN-HUB-001 – FN-HUB-006 | `e2e/functional/hub.spec.ts` |
| Projects | FN-PROJ-001 – FN-PROJ-004 | `e2e/functional/projects.spec.ts` |
| Cases | FN-CASES-001 – FN-CASES-012 | `e2e/functional/cases.spec.ts` |
| Import | FN-IMP-001 – FN-IMP-012 | `e2e/functional/import.spec.ts` |
| Plans | FN-PLAN-001 – FN-PLAN-003 | `e2e/functional/plans.spec.ts` |
| Runs | FN-RUN-001 – FN-RUN-008 | `e2e/functional/runs.spec.ts` |
| Issues | FN-ISS-001 – FN-ISS-003 | `e2e/functional/issues.spec.ts` |
| Triage | FN-TRI-001 – FN-TRI-003 | `e2e/functional/triage.spec.ts` |
| Automation | FN-AUTO-001 – FN-AUTO-004 | `e2e/functional/automation.spec.ts` |
| Reports and milestones | FN-REP-001 – FN-REP-005 | `e2e/functional/reports.spec.ts` |
| Quality graph | FN-QG-001 – FN-QG-008 | `e2e/functional/quality-graph.spec.ts` |
| Settings | FN-SET-001 – FN-SET-008 | `e2e/functional/settings.spec.ts` |
| Live updates | FN-LIVE-001 – FN-LIVE-002 | `e2e/functional/live.spec.ts` |
| Role UI | RBAC-ROLE-001 – RBAC-ROLE-004 | `e2e/rbac/roles.spec.ts` |
| Role API matrix | RBAC-API-001 – RBAC-API-010 | `tests/integration/rbac.integration.test.ts` |
| Token scopes | RBAC-TOK-001 – RBAC-TOK-006 | `tests/integration/rbac.integration.test.ts` |
| IDOR | RBAC-IDOR-001 – RBAC-IDOR-003 | `tests/integration/rbac.integration.test.ts` |
| Unauthenticated access | SEC-UNAUTH-001 – SEC-UNAUTH-003 | `tests/integration/security.integration.test.ts` |
| Session and CSRF | SEC-SESS-001 – SEC-SESS-002, SEC-CSRF-001 | `e2e/security/session.spec.ts`, `tests/integration/security.integration.test.ts` |
| Open redirect | SEC-REDIR-001 | `e2e/security/redirect.spec.ts` |
| XSS | SEC-XSS-001 – SEC-XSS-003 | `e2e/security/xss.spec.ts` |
| CSV, query, XXE | SEC-CSV-001, SEC-INJ-001 – SEC-INJ-002, SEC-XXE-001 – SEC-XXE-002 | `tests/integration/security.integration.test.ts` |
| Attachments | SEC-ATT-001 – SEC-ATT-005 | `tests/integration/security.integration.test.ts`, `e2e/security/attachments.spec.ts` |
| Webhooks and SSRF | SEC-HOOK-001 – SEC-HOOK-003, SEC-SSRF-001 – SEC-SSRF-002 | `tests/integration/security.integration.test.ts` |
| Share and invite tokens | SEC-SHARE-001 – SEC-SHARE-002 | `tests/integration/security.integration.test.ts` |
| Rate limit | SEC-RATE-001 | `tests/integration/security.integration.test.ts` |
| Secrets | SEC-SECRET-001 – SEC-SECRET-003 | `tests/integration/security.integration.test.ts` |
| Headers and audit | SEC-HEADERS-001, SEC-DEPS-001 | `tests/integration/security.integration.test.ts` |
| ZAP baseline | SEC-ZAP-001 | Manual |
| Axe | A11Y-AXE-001 – A11Y-AXE-004 | `e2e/a11y/axe-routes.spec.ts`, `e2e/a11y/axe-states.spec.ts` |
| Keyboard | A11Y-KEY-001 – A11Y-KEY-005 | `e2e/a11y/keyboard.spec.ts` |
| Semantics | A11Y-SEM-001 – A11Y-SEM-004 | `e2e/a11y/semantics.spec.ts` |
| Reflow and motion | A11Y-REFLOW-001 – A11Y-REFLOW-003 | `e2e/a11y/reflow.spec.ts` |
| Screen readers | A11Y-SR-001 – A11Y-SR-002 | Manual |
| Command palette | UX-PAL-001 – UX-PAL-003 | `e2e/ux/palette.spec.ts` |
| Shortcuts | UX-SHORT-001 – UX-SHORT-005 | `e2e/ux/shortcuts.spec.ts` |
| Optimistic, errors, empty | UX-OPT-001, UX-ERR-001, UX-EMPTY-001 | `e2e/ux/optimistic.spec.ts`, `e2e/ux/errors.spec.ts`, `e2e/ux/empty.spec.ts` |
| Theme, toasts, visual | UX-THEME-001, UX-TOAST-001, UX-VIS-001 | `e2e/ux/theme.spec.ts`, `e2e/ux/toasts.spec.ts`, `e2e/ux/visual.spec.ts` |
| Network | UX-NET-001 – UX-NET-003 | `e2e/ux/network.spec.ts` |
| Responsive layout | RESP-OVF-001, RESP-NAV-001, RESP-TBL-001, RESP-DLG-001, RESP-TGT-001 | `e2e/responsive/*.spec.ts` |
| Responsive flows | RESP-FLOW-001 – RESP-FLOW-005, RESP-ORI-001 | `e2e/responsive/flows-mobile.spec.ts`, `e2e/responsive/flows-tablet.spec.ts`, `e2e/responsive/orientation.spec.ts` |
| CLI | INT-CLI-001 – INT-CLI-006 | `tests/integration/cli.integration.test.ts` |
| MCP | INT-MCP-001 – INT-MCP-002 | `tests/integration/mcp.integration.test.ts` |
| Reporters | INT-RPT-001 – INT-RPT-004 | `tests/integration/reporters.integration.test.ts` |
| Issue providers | INT-ISS-001 – INT-ISS-002 | `tests/integration/issue-providers.integration.test.ts` |
| Outbound webhooks | INT-HOOK-001 – INT-HOOK-002 | `tests/integration/webhooks.integration.test.ts` |
| S3 attachments | INT-S3-001 | `tests/integration/attachments-s3.integration.test.ts` |
| Docker and Compose | OPS-DOCKER-001, OPS-COMPOSE-001 | `tests/ops/docker.test.ts`, `tests/ops/compose.test.ts` |
| Migrations and bootstrap | OPS-MIG-001 – OPS-MIG-004, OPS-BOOT-001 | `tests/ops/migrate.test.ts`, `tests/ops/bootstrap.test.ts` |
| Backup and restore | OPS-BAK-001 | Manual |
| Performance | OPS-PERF-001 – OPS-PERF-003 | `e2e/performance.spec.ts` |
| Lighthouse | OPS-LH-001 | Manual |
| Middleware convention | OPS-MW-001 | `e2e/security/session.spec.ts` and `e2e/security/api.spec.ts` |
| Browser support note | OPS-BROW-001 | `tests/ops/browser-support.test.ts` |

## 6. Defects, severity, and security header policy

File defects against a case id. Do not close a P0 case by lowering its priority.

| Severity | Use when | Examples |
| --- | --- | --- |
| S0 Blocker | Auth bypass, cross-workspace data leak, remote code execution, credential disclosure, or data loss on backup/restore. | IDOR returns Foreign Project cases. `AUTH_SECRET` in `.next/static`. XXE returns file contents. |
| S1 Critical | A P0 case fails, or a missing security header from SEC-HEADERS-001. Privilege escalation inside one workspace. | Viewer can `POST /api/cases`. CSP absent. Lockout does not engage. |
| S2 Major | A P1 case fails. A workaround exists. | Zephyr JSON import drops steps. NVDA does not announce a result change. ZAP medium finding. |
| S3 Minor | A P2 case fails, or a visual mismatch that does not block the task. | Screenshot diff on the hub. Flake queue copy is unclear. |
| S4 Trivial | Typos, alignment, docs nits found while testing. | Cheat sheet label omits a synonym but the keys work. |

Waiver rules:

- S0 cannot be waived for 0.1.x.
- S1 can be waived only with a written defect, an owner, and a release-note line. Missing security headers are S1. Record them at release time. Skipping the case is not a waiver.
- S2 should be fixed. A P1 waiver is the written defect itself.
- S3 and S4 do not block the tag.

### Security headers are defects, not skips

[SEC-HEADERS-001](#sec-headers-001--security-headers-are-present) is P0. Missing security headers are a logged defect, not a skipped area. They are not implemented. Record the defect at release time. Do not treat a missing header as an untested gap, and do not claim the automated suite currently fails CI on headers.

Record one S1 defect for each of these when it is absent on `/login`, `/`, and `/api/health`:

- `Content-Security-Policy`
- Framing protection: `X-Frame-Options` or CSP `frame-ancestors` (shipping neither is the defect; shipping either can satisfy framing, and CSP is still required for the CSP line)
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Strict-Transport-Security` on HTTPS origins

Title them `SEC-HEADERS-001: missing <header>`. Do not mark the case skipped, expected-fail, or passing with a comment. Do not describe the headers as already implemented.

The baseline headers are configured in `next.config.ts`; HSTS is applied by `src/proxy.ts` only for the configured HTTPS AUTH_URL. HTTP localhost does not qualify TLS/HSTS deployment. Missing headers remain defects.

### Middleware convention

Authentication for the app is wired in `src/proxy.ts` (NextAuth, with the allowlist in `src/auth.config.ts`). Installed Next 16.4.6 deprecates middleware.ts in favor of proxy.ts; the migration is implemented. [OPS-MW-001](#ops-mw-001--next-middleware-convention) reads `node_modules/next/dist/docs/` on the installed Next version and fails if the docs say this file is no longer the interceptor. File an S2 defect (S1 if the file is already not executing, because that means routes are unprotected). Do not relocate auth during a test run. If security headers are added in this file, they must be part of the same migration.

## 7. Manual-only checklists

These five checklists are not passed by unit tests or by axe. Record the tester, the date, the build SHA, and a pass or a defect id on each line.

### VoiceOver

Case [A11Y-SR-001](#a11y-sr-001--voiceover-on-login-cases-and-the-run-executor). macOS VoiceOver. Chromium is the release browser. Start VoiceOver before opening the app. Use the E2E admin unless a step says otherwise.

Login (`/login`):

- [ ] The page title and the `h1` "Topology" are read.
- [ ] Email and Password are announced with their labels, not as unlabeled edit fields.
- [ ] **Sign in with email** is a button and activates with Control-Option-Space (or VO activation).
- [ ] A wrong password is announced via the alert without a mouse move.
- [ ] If OAuth buttons are enabled in that build, **Continue with GitHub** / **Continue with Google** / **Use email instead** have names.

Cases (`/cases`):

- [ ] Landmark **Primary** is reachable from the rotor.
- [ ] The cases table or list exposes row text including key and title.
- [ ] **New case** opens a dialog whose name is announced, and focus moves into it.
- [ ] Escape closes the dialog and focus returns.
- [ ] **Search cases** is a search field. Typing does not trigger go-chords (speak the typed characters).
- [ ] Folder navigation **Folders** is a separate landmark from **Primary**.
- [ ] Empty project reads the guided copy, including "Create the first case".

Run executor (`/runs/<id>`):

- [ ] The case list is navigable. The focused case title is announced.
- [ ] **Mark \<key\> as passed** (and Failed, Blocked, Skipped) expose the status in the name, not only a color.
- [ ] After activation, the new status is announced politely.
- [ ] Notes and comments are labelled fields.
- [ ] **Complete run** is a button. After completion, disabled status buttons announce disabled.
- [ ] **Create issue** is available on a failed result and is a button.

### NVDA

Case [A11Y-SR-002](#a11y-sr-002--nvda-on-login-cases-and-the-run-executor). Windows. NVDA. Chrome. Browse mode for reading, focus mode for forms.

Login:

- [ ] Heading "Topology" is in the heading list at level 1.
- [ ] Tab order is Email, Password, **Sign in with email**.
- [ ] The error alert is announced when the password is wrong.
- [ ] Password characters are not spoken in full when character echo would leak them into a shared recording; confirm the field type is password.

Cases:

- [ ] The heading list does not skip levels.
- [ ] **New case** dialog traps Tab and Shift+Tab.
- [ ] Delete confirmation (**Delete case**) is announced as a confirmation, not a silent click.
- [ ] Status and priority are text, and NVDA does not say only "button" with no status.
- [ ] A saved view or filter change is announced or is obvious on the next read of the table.

Run executor:

- [ ] `P`, `F`, `B`, and `S` (NVDA pass-through, or focus mode) change the status and the change is announced.
- [ ] Those keys do not fire while NVDA is in the notes field.
- [ ] **Back to case list** is present at a narrow window (restore down below the `md` breakpoint) and has a name.
- [ ] Attachment download is announced as a download, not as navigation that runs HTML.
- [ ] Live update from a second session is announced politely and does not move focus.

### ZAP baseline

Case [SEC-ZAP-001](#sec-zap-001--owasp-zap-baseline).

- [ ] Baseline scan completed against `http://127.0.0.1:4317` and the report file is stored with the release evidence.
- [ ] Anonymous spider covered `/login`, `/api/health`, and a share URL.
- [ ] Authenticated context covered `/cases`, `/runs/<id>`, and `/settings` (cookie imported, not pasted into the report).
- [ ] High alerts triaged: each is a defect or a false positive with a sentence of evidence.
- [ ] Header alerts compared with SEC-HEADERS-001. Duplicates link to that defect. They are not marked ignored.
- [ ] Scan did not use production customer data. The target was the E2E seed.

### Backup and restore

Case [OPS-BAK-001](#ops-bak-001--backup-and-restore-round-trip). Commands from [docs/deploy.md](deploy.md).

- [ ] `pg_dump -Fc` completed and the file is non-empty.
- [ ] Attachments copy completed (volume or object-storage listing). `storage_key` values were recorded for one file.
- [ ] Restore into a clean database with `pg_restore --clean --if-exists` completed without a missing-relation error that left the app unable to boot.
- [ ] App health is 200 after restore.
- [ ] Case `BACKUP-<timestamp>` is visible after sign-in.
- [ ] Attachment downloads after blobs are restored.
- [ ] Before blobs were restored, download failed with a missing-file error and did not 200 an empty body.
- [ ] A second migrate on the restored database is a no-op ([OPS-MIG-003](#ops-mig-003--second-migrate-is-a-no-op)).

### Lighthouse

Case [OPS-LH-001](#ops-lh-001--lighthouse-on-hub-cases-and-a-run). Production server. Desktop. One run per URL. Record the numeric scores.

| URL | Performance ≥ 90 | Best Practices ≥ 90 | Accessibility = 100 | Report attached |
| --- | --- | --- | --- | --- |
| `/` hub | | | | |
| `/cases` | | | | |
| `/runs/<id>` | | | | |

- [ ] All nine cells meet the bar, or each miss has a defect id.
- [ ] Accessibility misses are cross-linked to an `A11Y-*` case.
- [ ] The run used the production build, not `next dev`.

## 8. Case index

Counts for this document:

| Prefix | Cases | IDs |
| --- | --- | --- |
| FN | 86 | AUTH 8, HUB 6, PROJ 4, CASES 12, IMP 12, PLAN 3, RUN 8, ISS 3, TRI 3, AUTO 4, REP 5, QG 8, SET 8, LIVE 2 |
| RBAC | 23 | ROLE 4, API 10, TOK 6, IDOR 3 |
| SEC | 34 | UNAUTH 3, SESS 2, CSRF 1, REDIR 1, XSS 3, CSV 1, INJ 2, XXE 2, ATT 5, HOOK 3, SSRF 2, SHARE 2, RATE 1, SECRET 3, HEADERS 1, DEPS 1, ZAP 1 |
| A11Y | 18 | AXE 4, KEY 5, SEM 4, REFLOW 3, SR 2 |
| UX | 17 | PAL 3, SHORT 5, OPT 1, ERR 1, EMPTY 1, THEME 1, TOAST 1, VIS 1, NET 3 |
| RESP | 11 | OVF 1, NAV 1, TBL 1, DLG 1, TGT 1, FLOW 5, ORI 1 |
| INT | 17 | CLI 6, MCP 2, RPT 4, ISS 2, HOOK 2, S3 1 |
| OPS | 14 | DOCKER 1, COMPOSE 1, MIG 4, BAK 1, BOOT 1, PERF 3, LH 1, MW 1, BROW 1 |
| **Total** | **220** | |

Manual-only cases, which automation must not mark passed on its own: **A11Y-SR-001**, **A11Y-SR-002**, **SEC-ZAP-001**, **OPS-BAK-001**, **OPS-LH-001**.

## Validation suite revision — 2026-11-16

The current implementation checklist and evidence take precedence over historical command descriptions above: [plan](../tasks/plan.md), [checklist](../tasks/todo.md), [commands and limitations](../tasks/validation/README.md), [coverage inventory](../tasks/validation/coverage-matrix.md), [findings](../tasks/validation/findings.md). Existing case IDs remain unchanged.

`test:e2e` now selects comprehensive Chromium after authentication setup; `test:e2e:smoke` preserves the previous two-spec selection. All release browser commands build and start production by default, with retries disabled and no server reuse. Firefox/WebKit core checks are required in CI. The harness provisions its own disposable services; never drop or reset the developer database. Migrations now include `0006_report_share_generation`. Report share links can be revoked per report; generation zero covers legacy links.

A successful test command alone does not satisfy the full release acceptance criteria. Unreviewed inventory entries, manual qualifications, skipped tests, visual baseline inspection, and missing operational/performance evidence remain open until explicitly evaluated. Require three clean retry-free sanity runs and one full release evaluation on the final revision.

### VAL-PROD-001 — Template review, launch and retest lineage

- **Priority:** P0
- **Expected:** Template review launches a new run without changing the source; retest selection excludes unmapped cases, creates untested results, and preserves source failures and lineage.
- **Automation:** `e2e/refinement.spec.ts`, `tests/integration/productivity.integration.test.ts`.
- **Manual qualification:** With a seeded instance, complete the review → launch → fail → select → retest journey and inspect both source and retest after reload.

### VAL-PROD-002 — Isolated authoring and HTTP project isolation

- **Priority:** P0
- **Expected:** Unique project/case fixtures persist after reload; another project's viewer cannot read the authored case; teardown removes the entire test project even after failure.
- **Automation:** `e2e/functional/isolated-authoring.spec.ts`.
- **Manual qualification:** Inspect project-switching clarity and keyboard behavior with two separately authenticated users.

### VAL-AUTO-001 — Batched ingestion preserves identity and statistics

- **Priority:** P0
- **Expected:** Crossing a 500-result batch boundary preserves every deduped result, authored intent links, project boundaries and legacy case-linked history. Concurrent runs share existing identities; a failed result write rolls back graph changes. Seven- and thirty-day rollups retain independently verified counts and percentiles.
- **Automation:** `tests/integration/ingest-batch.integration.test.ts`, `e2e/performance.spec.ts`.
- **Manual qualification:** Inspect the resulting automation run and reliability reports after a 10k-result ingest; compare the exported results to the input fixture.

### VAL-SEC-001 — HTTP token scopes and revocation

- **Priority:** P0
- **Expected:** Read, ci-write and agent scopes remain disjoint where required; revoked credentials return 401; newly issued tokens stop working immediately after real HTTP revocation.
- **Automation:** `e2e/security/api.spec.ts`, `tests/integration/mcp-scopes.integration.test.ts`.
- **Manual qualification:** Qualify external MCP client transport/scopes with a separately installed consumer; mocked in-process transport tests do not establish that result.

### VAL-VIS-001 — Stable light/dark visual baselines

- **Priority:** P1
- **Expected:** Primary screens, populated reports, long content, case details/authoring, empty and server-error states match inspected baselines. Fixture IDs/dates and browser time are controlled; authentication retains its real clock.
- **Automation:** `e2e/visual.spec.ts`.
- **Manual qualification:** Inspect every new or changed baseline on the named renderer before acceptance. Native zoom and screen-reader checks remain separate.

### VAL-PROD-003 — Authored matrix execution through retest reporting

- **Priority:** P0
- **Preconditions:** Disposable seeded production app; a unique project with its own authenticated admin.
- **Steps:** Author a ready case; create a two-browser/one-OS matrix plan through authenticated HTTP; launch and inspect both persisted runs; execute one failure in the UI; complete it; inspect triage; create a retest from that failure; pass and complete the retest; reload; export and view its report.
- **Expected:** Exactly two matrix runs each snapshot the authored case. Retest starts untested, passes, remains passed after reload, and exports exactly one passed case. The original result keeps its failed ID/status. Triage and report show the persisted authored case/run.
- **Automation:** `e2e/functional/plans.spec.ts` (combined author → matrix plan → failure → triage → retest → report test).
