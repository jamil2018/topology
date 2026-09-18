# Multi-project / data isolation — codebase exploration

Date: 2026-09-13. Repo: `/Users/jamil/Personal Projects/topology`.

## Verdict

**There is no project tenancy on domain data today.** Auth membership is scoped to a single default `workspaces` row (`slug: "default"`), but `cases`, `folders`, `runs`, milestones, triage, webhooks, tokens, etc. have **no `workspace_id` / `project_id`**. Lists in `src/lib/queries.ts` and almost all APIs read the whole DB. Multi-project isolation means adding a tenant FK (likely on `workspaces`, or a new `projects` table under workspace), threading it through schema → queries → APIs → CI/agent/MCP → seed/tests → sidebar/settings.

---

## 1. Database schema

**Single schema file:** `/Users/jamil/Personal Projects/topology/src/db/schema.ts`  
**DB client:** `/Users/jamil/Personal Projects/topology/src/db/index.ts` (`drizzle-orm/postgres-js`, schema object passed for relational queries)

### Enums

| Enum | Values |
|------|--------|
| `case_priority` | `P0`, `P1`, `P2`, `P3` |
| `case_status` | `draft`, `ready`, `blocked`, `deprecated` |
| `run_status` | `planned`, `in_progress`, `completed`, `aborted` |
| `result_status` | `untested`, `passed`, `failed`, `blocked`, `skipped` |
| `run_kind` | `manual`, `automation` |
| `triage_status` | `open`, `snoozed`, `resolved` |
| `milestone_status` | `active`, `archived` |
| `theme_preference` | `system`, `light`, `dark` |
| `workspace_role` | **`admin`**, **`member`**, **`viewer`** |
| `invite_status` | `pending`, `accepted`, `revoked` |
| `issue_provider` | `mock`, `jira`, `linear`, `github` |
| `issue_remote_status` | `open`, `in_progress`, `done`, `unknown` |
| `saved_view_entity` | `cases`, `runs` |

### Tables (auth / tenancy)

| Table | Export | Notes |
|-------|--------|-------|
| `users` | `users` | email unique; `password_hash`; `theme_preference` |
| `accounts` | `accounts` | NextAuth OAuth; PK `(provider, provider_account_id)` |
| `sessions` | `sessions` | NextAuth DB sessions table exists; **app uses JWT strategy** |
| `verification_tokens` | `verificationTokens` | NextAuth |
| `workspaces` | `workspaces` | `name`, **`slug` unique** — only tenancy root today |
| `workspace_members` | `workspaceMembers` | `(workspace_id, user_id)` unique; `role` enum |
| `workspace_invites` | `workspaceInvites` | email + role + token; status enum |

**No `orgs`, `teams`, or `projects` tables.**

### Tables (domain — currently global / unscoped)

| Table | Export | Tenant FK? | Key constraints |
|-------|--------|------------|-----------------|
| `folders` | `folders` | **none** | `parent_id` self-ref in relations only (no DB FK) |
| `cases` | `cases` | **none** | **`key` globally unique** |
| `runs` | `runs` | **none** | kind/source/shards fields for CI |
| `run_results` | `runResults` | via run/case | |
| `result_comments` | `resultComments` | via result | |
| `attachments` | `attachments` | via result | `storage_key` unique |
| `run_shards` | `runShards` | via run | |
| `api_tokens` | `apiTokens` | **none** (user-scoped only) | `token_hash` unique |
| `milestones` | `milestones` | **none** | optional `folder_id` |
| `triage_items` | `triageItems` | **none** | fingerprint; optional case/run/result |
| `linked_issues` | `linkedIssues` | **none** | provider + remote ids |
| `webhook_endpoints` | `webhookEndpoints` | **none** | global outbound hooks |
| `saved_views` | `savedViews` | **none** (scoped by `created_by_id` only) | |
| `case_activities` | `caseActivities` | via case | |

### Relations worth knowing

- `workspaces` → members, invites only (no domain children).
- `folders` → cases; parent folder; milestones optionally point at folder.
- `cases` → folder, author, assignee, results, linkedIssues, activities.
- `runs` → results, shards, linkedIssues, author/assignee.
- No Drizzle relation from domain tables to `workspaces`.

### Isolation implication

Anything that must be project-private needs a new column (recommend `workspace_id` if workspace == project, or `project_id` if projects nest under workspace). Also revisit:

- `cases.key` unique → likely unique per tenant: `unique(workspace_id, key)`
- Folder name uniqueness is app-enforced per parent (`folders/route.ts`), not DB — must become per-tenant
- `api_tokens`, `webhook_endpoints` may need tenant binding for CI/MCP isolation

---

## 2. Auth & roles

**Stack: NextAuth v5 (Auth.js)**, not Better Auth.  
Packages: `next-auth@5.0.0-beta.32`, `@auth/drizzle-adapter`.

| Concern | Path |
|---------|------|
| Full auth + providers | `/Users/jamil/Personal Projects/topology/src/auth.ts` |
| Edge-safe config / middleware callbacks | `/Users/jamil/Personal Projects/topology/src/auth.config.ts` |
| Route handlers | `/Users/jamil/Personal Projects/topology/src/app/api/auth/[...nextauth]/route.ts` |
| Middleware wrapper | `/Users/jamil/Personal Projects/topology/src/middleware.ts` |
| Session type | `/Users/jamil/Personal Projects/topology/src/types/next-auth.d.ts` |
| Workspace helpers | `/Users/jamil/Personal Projects/topology/src/lib/workspace.ts` |
| Role helpers | `/Users/jamil/Personal Projects/topology/src/lib/workspace-roles.ts` |
| CI/agent bearer tokens | `/Users/jamil/Personal Projects/topology/src/lib/ci-auth.ts` (re-exported as `api-auth.ts`) |

### Providers

- Credentials (email/password vs `users.passwordHash` / bcrypt)
- GitHub / Google if `AUTH_GITHUB_*` / `AUTH_GOOGLE_*` set
- DrizzleAdapter wired to users/accounts/sessions/verificationTokens
- **`session: { strategy: "jwt" }`** — adapter sessions table mostly unused at runtime

### Session shape

```ts
session.user = { id: string; name?; email?; image? }
```

JWT callback copies `user.id` → `token.sub` → `session.user.id`. **No role, no workspaceId on the session.**

### Middleware / public routes (`auth.config.ts`)

Allowed without login: `/login`, `/api/auth/*`, `/api/ci/*`, `/api/agent/*`, `/api/health`, `/health`, `/api/invites/*`, `/invite/*`. Everything else requires `auth.user`.

### Roles

Enum: **`admin` | `member` | `viewer`** (`workspaceRoleEnum`).

```ts
ROLE_RANK = { viewer: 1, member: 2, admin: 3 }
canWrite(role)  // admin | member
canAdmin(role)  // admin only
hasAtLeast(role, required)
```

### Membership pattern (current tenancy)

```ts
ensureDefaultWorkspace()  // upsert workspaces where slug === "default", name "Topology"
ensureMembership(userId, role = "admin")  // join default workspace
getMembership(userId)  // { workspace, membership }
```

**Important quirks:**

1. `ensureMembership` defaults role to **`admin`** when auto-joining (home page + seed). Invites can assign member/viewer.
2. Role checks are **not** applied on cases/runs/folders/milestones APIs — only login gate.
3. `canWrite` / `canAdmin` used on:
   - `/api/workspace` (admin for invite/role change)
   - `/api/results/[id]/comments` POST
   - `/api/results/[id]/attachments` POST

### API token auth (CI / MCP / agent)

`authenticateCiRequest(request)`:

1. `Authorization: Bearer …`
2. Env escape hatch: `TOPOLOGY_API_TOKEN` → demo user by `DEMO_USER_EMAIL`
3. Else SHA-256 hash lookup in `api_tokens`
4. Returns `{ ok, userId }` — **no workspace/project**

---

## 3. API layer

**No `"use server"` actions anywhere.** Data access is:

1. RSC pages calling `src/lib/queries.ts`
2. Route Handlers under `src/app/api/**/route.ts` using `auth()` or bearer token + `db` / queries

### Pattern A — session cookie (UI)

```ts
const session = await auth();
if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
const data = await listCases(...); // unscoped
```

Used by: cases, folders, runs, milestones, triage, settings, views, search, import, issues, flake, webhooks, most of results.

### Pattern B — role-aware (rare)

```ts
await ensureMembership(session.user.id);
const { membership } = await getMembership(session.user.id);
if (!membership || !canWrite(membership.role)) return 403;
```

### Pattern C — bearer token (CI / agent / MCP)

```ts
const authResult = await authenticateApiToken(request); // or authenticateCiRequest
```

Routes: `/api/ci/**`, `/api/agent`.

### Query hub (must scope for isolation)

`/Users/jamil/Personal Projects/topology/src/lib/queries.ts`

| Function | Scope today |
|----------|-------------|
| `getHubPulse` | global aggregates |
| `listCases(folderId?)` | all cases / by folder |
| `listFolders` | all folders |
| `listRuns(kind?)` | all runs |
| `listSavedViews(entity, userId)` | by user only |
| `getRunWithResults` | by id |
| `listMilestonesWithReadiness` / `getActiveMilestoneReadiness` | global |
| `getTriageQueue` | global |
| `getFlakeHints` | global |
| `listRunReports` / `getRunReport` | global |

### API route map

| Path | Auth | Notes |
|------|------|-------|
| `/api/auth/[...nextauth]` | NextAuth | |
| `/api/cases` | session | GET/POST/PATCH bulk — no role check |
| `/api/cases/[id]/activity` | session | |
| `/api/folders`, `/api/folders/[id]` | session | nested create via `parentId` |
| `/api/runs`, `/api/runs/[id]` | session | |
| `/api/milestones` | session | |
| `/api/triage` | session | |
| `/api/views`, `/api/views/[id]` | session | per-user saved views |
| `/api/settings` | session | profile/theme/password — user-scoped |
| `/api/workspace` | session | members/invites; admin writes |
| `/api/invites/[token]` | public | accept invite |
| `/api/search` | session | |
| `/api/import/csv` (+ template) | session | |
| `/api/issues` | session | issue tracker; `projectKey` is **Jira** key, not Topology project |
| `/api/flake` | session | |
| `/api/webhooks` | session | global endpoints |
| `/api/results/[id]/comments` | session + canWrite | |
| `/api/results/[id]/attachments` | session + canWrite | |
| `/api/attachments/[id]` | session | |
| `/api/ci/junit`, `/api/ci/runs`, shards, complete | bearer | |
| `/api/agent` | bearer | MCP backend |
| `/api/health`, `/health` | public | |

### MCP

| File | Role |
|------|------|
| `/Users/jamil/Personal Projects/topology/packages/mcp/src/server.ts` | MCP tools |
| `/Users/jamil/Personal Projects/topology/packages/mcp/src/client.ts` | HTTP client → `/api/agent` |
| `/Users/jamil/Personal Projects/topology/packages/mcp/bin/topology-mcp.js` | CLI entry |

Tools: `list_cases`, `create_case`, `list_runs`, `create_run`, `list_results`, `record_result`, `whats_pending`, `get_scenario_context`, `create_issue`, `link_issue`. Auth: `TOPOLOGY_URL` + `TOPOLOGY_API_TOKEN`. **No project parameter.**

---

## 4. Sidebar / nav / settings

| Piece | Path |
|-------|------|
| App shell + sidebar | `/Users/jamil/Personal Projects/topology/src/components/hub-shell.tsx` |
| Settings UI | `/Users/jamil/Personal Projects/topology/src/components/settings-workspace.tsx` |
| Members panel | `/Users/jamil/Personal Projects/topology/src/components/workspace-members-panel.tsx` |
| Command palette | `/Users/jamil/Personal Projects/topology/src/components/command-palette.tsx` |
| Providers (SessionProvider) | `/Users/jamil/Personal Projects/topology/src/components/providers.tsx` |

### Nav groups (hardcoded in `hub-shell.tsx`)

- Overview: `/` Hub
- Testing: `/cases`, `/runs`, `/automation`, `/milestones`
- Insights: `/reports`, `/triage`
- Account: `/settings`

**No project switcher.** Breadcrumb is group → page label only.

### Pages (all wrap `HubShell` when authenticated)

| Route | File |
|-------|------|
| `/` | `src/app/(home)/page.tsx` — calls `ensureMembership` |
| `/cases` | `src/app/cases/page.tsx` |
| `/runs`, `/runs/[id]` | `src/app/runs/...` |
| `/automation` | `src/app/automation/page.tsx` |
| `/milestones` | `src/app/milestones/page.tsx` |
| `/reports`, `/reports/[id]` | `src/app/reports/...` |
| `/triage` | `src/app/triage/page.tsx` |
| `/settings?section=` | `src/app/settings/page.tsx` |
| `/connect` | `src/app/connect/page.tsx` |
| `/login` | `src/app/login/page.tsx` |
| `/invite/[token]` | `src/app/invite/[token]/page.tsx` |

### Settings sections (`?section=`)

`profile` | `preferences` | `members` | `connections` (MCP) | `ci` | `webhooks`

Page allowlist also accepts `connections`/`ci`/`profile`/`preferences`; **members** is in the client SECTIONS list (use `?section=members`).

---

## 5. Migrations

| Item | Path / command |
|------|----------------|
| Kit config | `/Users/jamil/Personal Projects/topology/drizzle.config.ts` — schema `./src/db/schema.ts`, out `./drizzle` |
| SQL migrations | `/Users/jamil/Personal Projects/topology/drizzle/*.sql` |
| Apply script | `/Users/jamil/Personal Projects/topology/src/db/migrate.ts` |
| Scripts | `npm run db:generate` / `db:push` / `db:migrate` / `db:seed` / `db:studio` |

**No `drizzle/meta` journal** — migrations are hand-maintained idempotent SQL, applied in lexical order via `sql.unsafe(body)`.

### Files

| File | Contents |
|------|----------|
| `0001_linked_issues.sql` | `linked_issues` + issue enums |
| `0002_user_theme_preference.sql` | theme on users |
| `0003_auth_collab_ops.sql` | workspaces, members, invites, assignees, comments, attachments |
| `0004_milestones_webhooks.sql` | milestone thresholds + `webhook_endpoints` |
| `0005_saved_views_case_activities.sql` | saved_views + case_activities |

### Pattern to follow for new tenant columns

```sql
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
-- backfill to default workspace, then NOT NULL
CREATE INDEX IF NOT EXISTS cases_workspace_id_idx ON cases(workspace_id);
-- drop global unique on key; add UNIQUE (workspace_id, key)
```

Prefer `IF NOT EXISTS` / `DO $$ BEGIN … EXCEPTION WHEN duplicate_object` like existing files. `db:push` is documented as preferred for local schema sync; checked-in SQL for CI/shared apply.

---

## 6. Test patterns

| Suite | Config | Include |
|-------|--------|---------|
| Unit | `vitest.packages.config.ts` | `src/**/*.test.ts`, `packages/*/src/**/*.test.ts` |
| UI | `vitest.ui.config.ts` | `src/**/*.test.tsx` (jsdom) |
| Integration | `vitest.integration.config.ts` | `tests/integration/**/*.integration.test.ts`; `fileParallelism: false` |
| E2E | `playwright.config.ts` | `e2e/*.spec.ts` |

**Setup:** `/Users/jamil/Personal Projects/topology/vitest.setup.ts` loads `.env.local` / `.env`, defaults:

- `DATABASE_URL=postgresql://topology:topology@127.0.0.1:54329/topology`
- `TOPOLOGY_API_TOKEN=topo_demo_token_local_dev_only`
- `DEMO_USER_EMAIL=demo@topology.local`
- `AUTH_SECRET=…`

**Postgres:** `docker-compose.yml` → port **54329**. CI workflow mirrors this.

### Integration style (`tests/integration/ci-ingest.integration.test.ts`)

- `describe.skipIf(!hasDb)`
- Dynamic `import("@/app/api/…/route")` and call `GET`/`POST` with `Request`
- Bearer via `TOPOLOGY_API_TOKEN`
- Direct `db.insert(runs)` for fixtures — **no per-test DB truncate/transaction helper**
- Seed expected separately (`npm run db:seed`)

### Unit examples to mirror

- Roles: `src/lib/workspace-roles.test.ts`
- Auth config: `src/auth.config.test.ts`
- CI auth: `src/lib/ci-auth.test.ts`

For isolation tests: create two workspaces/projects, seed cases with different FKs, assert `listCases` / APIs never cross-leak; extend integration suite the same way (import route handlers, real DB).

---

## 7. Key file paths (cheat sheet)

| Area | Absolute path |
|------|----------------|
| Schema | `/Users/jamil/Personal Projects/topology/src/db/schema.ts` |
| DB client | `/Users/jamil/Personal Projects/topology/src/db/index.ts` |
| Seed | `/Users/jamil/Personal Projects/topology/src/db/seed.ts` |
| Migrate | `/Users/jamil/Personal Projects/topology/src/db/migrate.ts` |
| Drizzle SQL | `/Users/jamil/Personal Projects/topology/drizzle/` |
| Auth | `/Users/jamil/Personal Projects/topology/src/auth.ts`, `auth.config.ts`, `middleware.ts` |
| Workspace / roles | `/Users/jamil/Personal Projects/topology/src/lib/workspace.ts`, `workspace-roles.ts` |
| Queries | `/Users/jamil/Personal Projects/topology/src/lib/queries.ts` |
| Sidebar | `/Users/jamil/Personal Projects/topology/src/components/hub-shell.tsx` |
| Settings | `/Users/jamil/Personal Projects/topology/src/app/settings/page.tsx`, `components/settings-workspace.tsx` |
| Cases API | `/Users/jamil/Personal Projects/topology/src/app/api/cases/route.ts` |
| Runs API | `/Users/jamil/Personal Projects/topology/src/app/api/runs/route.ts`, `runs/[id]/route.ts` |
| Folders API | `/Users/jamil/Personal Projects/topology/src/app/api/folders/route.ts`, `folders/[id]/route.ts` |
| Workspace API | `/Users/jamil/Personal Projects/topology/src/app/api/workspace/route.ts` |
| Settings API | `/Users/jamil/Personal Projects/topology/src/app/api/settings/route.ts` |
| Agent/MCP API | `/Users/jamil/Personal Projects/topology/src/app/api/agent/route.ts` |
| CI auth | `/Users/jamil/Personal Projects/topology/src/lib/ci-auth.ts` |
| MCP package | `/Users/jamil/Personal Projects/topology/packages/mcp/` |
| Domain pure logic | `/Users/jamil/Personal Projects/topology/packages/domain/` |

---

## Patterns to follow when implementing isolation

1. **Reuse `workspaces` as the project boundary** unless you need org→many projects; membership/roles already exist. Extend `ensureDefaultWorkspace` / `getMembership` to `getActiveWorkspace(userId)` or accept slug/id from cookie/header.
2. **Put `workspaceId` on every domain table** you list above (at minimum: folders, cases, runs, milestones, triage_items, linked_issues, webhook_endpoints, api_tokens, saved_views). Child tables can inherit via parent FK if you always join through run/case.
3. **Thread `workspaceId` into `listCases` / `listFolders` / `listRuns` / `getHubPulse` / etc.** first — RSC pages and APIs both go through queries.
4. **API gate:** after `auth()`, resolve membership for that workspace; use `canWrite` on mutations (cases/runs currently skip this).
5. **CI/agent:** bind `api_tokens.workspace_id` (or require `X-Topology-Workspace` + membership) so MCP/CI cannot see other tenants.
6. **Session:** optionally add `workspaceId` + `role` to JWT session (extend `next-auth.d.ts`) to avoid repeated lookups — today only `user.id` is present.
7. **Migrations:** new numbered `drizzle/0006_….sql` idempotent; backfill existing rows to default workspace; tighten uniqueness on `cases.key`.
8. **UI:** project switcher in `hub-shell.tsx` chrome; settings members panel already talks to `/api/workspace` for the single default workspace.
9. **Seed:** `seed.ts` already calls `ensureMembership(user.id, "admin")` — after FK, insert domain rows with that workspace id.
10. **Do not confuse** issue-provider `projectKey` (Jira) with Topology projects.

---

## Related internal notes

- `/Users/jamil/Personal Projects/topology/internal/cases-folders-exploration.md` — folders/`parentId` / cases UI
- `/Users/jamil/Personal Projects/topology/internal/auth-collab-gap-analysis.md` — workspace/roles gaps
