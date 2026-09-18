# Auth, Membership, Roles & Permissions — Topology Codebase Report

**Explored:** `/Users/jamil/Personal Projects/topology` (branch `cursor/fix-runs-page-conflict-a87b`)  
**Worktrees checked:** `.worktrees/auth-collab-ops-f8a9` (older auth/collab slice), `.worktrees/multi-project-support-d62a` (matches main for `project.ts`, `workspace/route.ts`)  
**Date:** 2026-09-13

---

## Executive summary

Topology uses **Auth.js / next-auth v5** (JWT sessions) for browser auth and **Bearer API tokens** for CI/agent. Tenancy is modeled as **workspaces**, aliased in code as **projects** (`export type Project = Workspace`). Membership and RBAC live in `workspace_members` with roles `admin | member | viewer`. Permission enforcement is centralized in `requireProjectAccess()` with `canWrite` / `canAdmin` helpers — **not** in middleware. The gap analysis file `internal/auth-collab-gap-analysis.md` is **largely outdated**; most items it marks “absent” are now implemented on main.

---

## 1. Database schema

**Primary file:** `src/db/schema.ts`  
**Migrations:** `drizzle/0003_auth_collab_ops.sql`, `drizzle/0006_multi_project_isolation.sql`

### Enums

```typescript
export const workspaceRoleEnum = pgEnum("workspace_role", [
  "admin",
  "member",
  "viewer",
]);

export const inviteStatusEnum = pgEnum("invite_status", [
  "pending",
  "accepted",
  "revoked",
]);
```

### Users & Auth.js adapter tables

| Table | Key columns |
| --- | --- |
| `users` | `id`, `name`, `email` (unique), `emailVerified`, `image`, `passwordHash`, `themePreference`, `createdAt` |
| `accounts` | OAuth provider linkage (composite PK: provider + providerAccountId) |
| `sessions` | `sessionToken`, `userId`, `expires` |
| `verification_tokens` | email verification |

### Workspaces (= projects)

```typescript
export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  archivedAt: timestamp("archived_at", { mode: "date" }),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "date" }).defaultNow().notNull(),
});
```

### Membership & invites

```typescript
export const workspaceMembers = pgTable(
  "workspace_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    role: workspaceRoleEnum("role").default("member").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (table) => [unique().on(table.workspaceId, table.userId)],
);

export const workspaceInvites = pgTable("workspace_invites", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  role: workspaceRoleEnum("role").default("member").notNull(),
  token: text("token").notNull().unique(),
  status: inviteStatusEnum("status").default("pending").notNull(),
  invitedById: uuid("invited_by_id").references(() => users.id, { onDelete: "set null" }),
  expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
  createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  acceptedAt: timestamp("accepted_at", { mode: "date" }),
});
```

### Domain tables scoped by `workspace_id`

All carry `workspaceId` FK → `workspaces.id` (cascade delete):

- `folders`, `cases`, `runs`, `milestones`, `triage_items`, `linked_issues`, `webhook_endpoints`, `api_tokens`, `saved_views`

**Cases** use per-project unique keys: `unique().on(table.workspaceId, table.key)`.

### Assignees (not RBAC — attribution/ownership)

- `cases.assigneeId`, `runs.assigneeId`, `runResults.assigneeId` → `users.id`

### Collaboration extras (post gap-analysis)

- `result_comments` (resultId, userId, body)
- `attachments` (resultId, commentId, filename, storageKey, uploadedById)

### Exported types

```typescript
export type WorkspaceRole = (typeof workspaceRoleEnum.enumValues)[number];
export type Workspace = typeof workspaces.$inferSelect;
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type WorkspaceInvite = typeof workspaceInvites.$inferSelect;
export type Project = Workspace;  // alias
```

**No separate `projects` or `project_members` table** — project == workspace, membership == workspace membership.

---

## 2. Admin vs member enforcement

### Layer 1: Middleware (`src/middleware.ts` + `src/auth.config.ts`)

Session gate only. Does **not** inspect roles.

```typescript
authorized({ auth, request }) {
  // Allows unauthenticated: /login, /api/auth/*, /api/ci/*, /api/agent, /api/health, /health,
  // /api/invites/*, /invite/*
  // All other routes require auth?.user
}
```

JWT strategy; session extended with `user.id` via callbacks in `auth.config.ts`.

### Layer 2: Role helpers (`src/lib/workspace-roles.ts`)

```typescript
export const ROLE_RANK: Record<WorkspaceRole, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
};

export function canWrite(role: WorkspaceRole | null | undefined): boolean
  // admin || member

export function canAdmin(role: WorkspaceRole | null | undefined): boolean
  // admin only

export function hasAtLeast(role: WorkspaceRole | null | undefined, required: WorkspaceRole): boolean
  // ROLE_RANK comparison
```

Re-exported from `src/lib/workspace.ts`.

### Layer 3: Project access gate (`src/lib/project.ts`)

**Active project resolution:**

- Cookie: `topology_project_id` (`PROJECT_COOKIE`)
- Header: `x-topology-project-id` (`PROJECT_HEADER`)
- Fallback: first accessible project; bootstrap via `ensureMembership(userId, "admin")` if none

```typescript
export async function requireProjectAccess(
  userId: string,
  options?: {
    preferredId?: string | null;
    request?: Request | null;
    write?: boolean;
    admin?: boolean;
    allowArchived?: boolean;
  },
): Promise<
  | { ok: true; ctx: ActiveProjectContext }
  | { ok: false; status: number; error: string }
>
```

**Behavior:**

| Option | Effect |
| --- | --- |
| (default) | Any member role can read; archived projects blocked unless `allowArchived` |
| `write: true` | Requires `canWrite` → admin or member; 403 for viewer |
| `admin: true` | Requires `canAdmin` → admin only |
| `allowArchived: true` | Resolves specific archived project by `preferredId` |

Returns `ActiveProjectContext`: `{ project, membership, projects[] }`.

### Layer 4: Bootstrap helpers (`src/lib/workspace.ts`)

```typescript
export async function ensureDefaultWorkspace()
export async function ensureMembership(userId: string, role: WorkspaceRole = "admin")
export async function getMembership(userId: string, projectId?: string)
```

**Important:** Many routes call `ensureMembership(session.user.id, "admin")` before `requireProjectAccess`. This only **inserts** membership if missing — it does not upgrade existing roles. First-time users get admin on the default workspace.

### Layer 5: Bearer token auth (`src/lib/ci-auth.ts`)

Used by `/api/ci/*` and `/api/agent` (via `src/lib/api-auth.ts` re-export):

```typescript
export async function authenticateCiRequest(request: Request): Promise<
  | { ok: true; userId: string | null; workspaceId: string }
  | { ok: false; status: number; error: string }
>
```

- Validates `Authorization: Bearer <token>`
- Env escape hatch: `TOPOLOGY_API_TOKEN` → default workspace + demo user
- DB tokens: `api_tokens.tokenHash` → scoped to `api_tokens.workspaceId`
- **No role checks** on token — token implies write access to that workspace

### Enforcement matrix (session APIs)

| Access level | Roles | Typical routes |
| --- | --- | --- |
| Read (member+) | admin, member, viewer | GET on cases, runs, folders, search, triage, webhooks, milestones, etc. |
| Write | admin, member | POST/PATCH/DELETE mutations with `write: true` |
| Admin | admin | `/api/workspace` POST/PATCH (invites, role changes), `/api/projects` PATCH/DELETE, project create gate |

### Server pages (RSC)

Pages call `auth()` + `ensureMembership()` + `resolveActiveProject()` — **no write/admin gate at page level**. Viewers can load UI; mutations fail at API with 403.

Example (`src/app/cases/page.tsx`):

```typescript
await ensureMembership(session.user.id);
const ctx = await resolveActiveProject(session.user.id);
const workspaceId = ctx.project.id;
// listCases(workspaceId) ...
```

### Known gaps / quirks

1. **`/api/workspace` GET** calls `ensureMembership(..., "admin")` before checking access — harmless for existing members but documents intent to bootstrap admins.
2. **No member removal API** — PATCH role only; no DELETE member or invite revoke endpoint.
3. **UI is not fully read-only for viewers** — only members panel and projects panel hide admin controls; case/run editors may still render (API blocks writes).
4. **CI/agent tokens bypass RBAC** — workspace-scoped but always write-capable.
5. **`/api/settings`** — user-scoped only (correct); no project check needed.

---

## 3. Settings UI — members & invites

| File | Role |
| --- | --- |
| `src/components/settings-workspace.tsx` | Tab shell; section `members` → `WorkspaceMembersPanel` |
| `src/components/workspace-members-panel.tsx` | Lists members, pending invites; admin-only invite form + role `<select>` |
| `src/components/projects-panel.tsx` | Project CRUD; gated by `canManage` from API |
| `src/components/invite-accept-client.tsx` | Accept flow UI |
| `src/app/invite/[token]/page.tsx` | Public invite landing |
| `src/app/settings/page.tsx` | Server page wrapper |

**Members panel** fetches `GET /api/workspace`, shows:
- Member list with role (editable select if `data.me.canAdmin`)
- Invite form (email + role) → `POST /api/workspace`
- Pending invites list
- Accept URL displayed after invite creation

**Projects panel** fetches `GET /api/projects?includeArchived=1`:
- Create/rename/archive/delete when `canManage` (user is admin on any non-archived project)

Settings URL: `/settings?section=members` or `section=projects`.

---

## 4. Key API routes needing permission checks

### Already wired with `requireProjectAccess`

| Route | GET | Mutations |
| --- | --- | --- |
| `/api/cases` | read | POST/PATCH `write: true` |
| `/api/cases/[id]/activity` | read | — |
| `/api/folders`, `/api/folders/[id]` | read | write |
| `/api/runs`, `/api/runs/[id]` | read | write |
| `/api/results/[id]/comments` | read | POST `write: true` |
| `/api/results/[id]/attachments` | read | POST `write: true` |
| `/api/attachments/[id]` | read/download | — |
| `/api/milestones` | read | write |
| `/api/triage` | read | PATCH `write: true` |
| `/api/issues` | read | POST `write: true` |
| `/api/import/csv` | read | POST `write: true` |
| `/api/views`, `/api/views/[id]` | read | write |
| `/api/search`, `/api/flake` | read | — |
| `/api/webhooks` | read | POST/PATCH/DELETE `write: true` |
| `/api/workspace` | read (any member) | POST/PATCH `admin: true` |
| `/api/projects` | list (session) | select: read; create: admin-anywhere; PATCH/DELETE `admin: true` |
| `/api/ci/runs` (session branch) | read | — |

### Session auth only (no project/role gate)

| Route | Notes |
| --- | --- |
| `/api/settings` | User profile/password/theme — OK |
| `/api/import/csv/template` | Session only |
| `/api/invites/[token]` GET | Public invite metadata |
| `/api/invites/[token]` POST | Session + email match; adds membership |

### Bearer auth (no role granularity)

| Route | Auth |
| --- | --- |
| `/api/ci/junit`, `/api/ci/runs/[id]/shards`, `/api/ci/runs/[id]/complete` | `authenticateCiRequest` |
| `/api/agent` | `authenticateApiToken` → workspaceId scope |
| `/api/health` | Public |

### Routes that would need checks if extended

- Member removal, invite revoke — **not implemented**
- API token creation UI/API — tokens stored per workspace; creation path via seed/env today
- Any new cross-workspace admin endpoints

---

## 5. Existing tests

| File | Coverage |
| --- | --- |
| `src/lib/workspace-roles.test.ts` | `ROLE_RANK`, `canWrite`, `canAdmin`, `hasAtLeast` |
| `src/lib/project.test.ts` | `slugifyProjectName`, role gate expectations |
| `src/auth.config.test.ts` | Middleware `authorized` callback paths |
| `src/lib/ci-auth.test.ts` | Token hash/generation |
| `src/components/login-form.test.tsx` | OAuth vs air-gap login UI |
| `tests/integration/multi-project.integration.test.ts` | Cross-project data isolation; `userIsProjectAdminAnywhere` |
| `tests/integration/issues-mcp.integration.test.ts` | `authenticateCiRequest`, agent bearer auth |
| `tests/integration/ci-ingest.integration.test.ts` | CI ingest with bearer token |
| `e2e/smoke.spec.ts` | Demo login → hub; health endpoint |

**Missing:** HTTP-level tests for viewer 403 on writes, invite accept E2E, workspace members API, role change flows.

---

## 6. Multi-project scoping model

**Terminology:** UI says “Project”; DB says `workspaces`. Single membership table — **no project-level membership separate from workspace**.

```
User ──< workspace_members >── Workspace (= Project)
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
                 cases              runs           api_tokens
              (workspace_id)    (workspace_id)   (workspace_id)
```

**Scoping mechanism:**

1. User has 0..N `workspace_members` rows (one per project).
2. Active project selected via cookie/header.
3. All queries filter by `access.ctx.project.id` as `workspaceId`.
4. `listUserProjects(userId)` drives project switcher.
5. Archived projects hidden from switcher unless `includeArchived`.
6. Default workspace slug `"default"` — cannot delete.

**Admin-for-create-projects:** `userIsProjectAdminAnywhere(userId)` — true if user is admin on any non-archived workspace. Used to gate `POST /api/projects` (create new project).

**Worktree note:** `.worktrees/auth-collab-ops-f8a9` has workspaces/members/invites but **lacks** `workspace_id` on domain tables (pre-`0006` migration). `.worktrees/multi-project-support-d62a` aligns with main.

---

## 7. Relevant file paths

### Schema & migrations
- `src/db/schema.ts`
- `drizzle/0003_auth_collab_ops.sql`
- `drizzle/0006_multi_project_isolation.sql`
- `src/db/seed.ts`, `src/db/migrate.ts`

### Auth
- `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`
- `src/types/next-auth.d.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/login/page.tsx`, `src/components/login-form.tsx`

### RBAC & tenancy
- `src/lib/workspace-roles.ts`
- `src/lib/workspace.ts`
- `src/lib/project.ts`
- `src/lib/project-shell.ts`
- `src/lib/ci-auth.ts`, `src/lib/api-auth.ts`

### Settings & members UI
- `src/app/settings/page.tsx`
- `src/components/settings-workspace.tsx`
- `src/components/workspace-members-panel.tsx`
- `src/components/projects-panel.tsx`
- `src/components/project-switcher.tsx`
- `src/components/invite-accept-client.tsx`
- `src/app/invite/[token]/page.tsx`

### API
- `src/app/api/workspace/route.ts` — members & invites
- `src/app/api/projects/route.ts` — project CRUD & selection
- `src/app/api/invites/[token]/route.ts`
- `src/app/api/settings/route.ts`
- All domain routes under `src/app/api/{cases,runs,folders,...}/`

---

## 8. Summary of `internal/auth-collab-gap-analysis.md`

**Status: outdated relative to current main branch.**

Written 2026-09-13 against an earlier tree. It correctly documents the **auth stack** (next-auth v5, login, middleware, seed) and **package scripts**, but marks many features as **absent** that are now **implemented**:

| Gap analysis claim | Current main reality |
| --- | --- |
| No workspaces/members/invites/roles | ✅ `workspaces`, `workspace_members`, `workspace_invites`, `workspace_role` enum |
| No assignees | ✅ `assigneeId` on cases, runs, run_results |
| No comments/attachments | ✅ `result_comments`, `attachments` tables + API routes |
| No Settings → Members | ✅ `WorkspaceMembersPanel` at `/settings?section=members` |
| Global single-tenant | ✅ `workspace_id` on all domain tables (migration 0006) |
| No `/api/health` | ✅ `src/app/api/health/route.ts` |
| OAuth not primary UX | Partially addressed — `LoginForm` has air-gap mode |

**Still accurate gaps from that doc:**

- OAuth-first UX polish (email secondary collapse)
- Unified 15-minute onboarding doc / CONTRIBUTING
- Member removal & invite revoke APIs
- Result notes UI completeness (may still vary)
- App container healthcheck in compose

**Suggested implementation order** from gap doc remains directionally valid for remaining polish, but phases 2–3 (collab + multi-project) are largely landed on main.

---

## 9. Package.json scripts (test / migrate)

```json
"db:generate": "drizzle-kit generate",
"db:push": "drizzle-kit push",
"db:migrate": "tsx --env-file=.env.local src/db/migrate.ts",
"db:seed": "tsx --env-file=.env.local src/db/seed.ts",
"db:studio": "drizzle-kit studio",
"test": "npm run test:unit",
"test:unit": "vitest run --config vitest.packages.config.ts",
"test:integration": "vitest run --config vitest.integration.config.ts",
"test:ui": "vitest run --config vitest.ui.config.ts",
"test:watch": "vitest --config vitest.packages.config.ts",
"test:e2e": "playwright test",
"test:all": "npm run test:unit && npm run test:integration && npm run test:ui && npm run test:e2e"
```

Integration tests require `DATABASE_URL` (skipped otherwise).
