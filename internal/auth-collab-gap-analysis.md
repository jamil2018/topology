# Auth / collaboration / ops gap analysis (Topology)

Explored: `/Users/jamil/Personal Projects/topology` (working tree). Date: 2026-09-13.

Search coverage: `oauth`, `invite`, `role`, `comment`, `attachment`, `healthcheck`, `CONTRIBUTING`, `seed`, `workspace member`, plus schema/API/UI walks.

---

## Inventory snapshot

| Item | Value |
| --- | --- |
| **Auth library** | **Auth.js / next-auth v5** (`next-auth@^5.0.0-beta.32`) + `@auth/drizzle-adapter`. **Not** better-auth. |
| **Login page** | `/Users/jamil/Personal Projects/topology/src/app/login/page.tsx` → `LoginForm` |
| **Auth core** | `src/auth.ts`, `src/auth.config.ts`, `src/middleware.ts`, `src/app/api/auth/[...nextauth]/route.ts` |
| **CONTRIBUTING** | **Absent** (no `CONTRIBUTING*` file) |
| **App `/health`** | **Absent** |
| **Dockerfile** | **Absent** (compose = Postgres only) |

### `package.json` scripts

| Script | Purpose |
| --- | --- |
| `dev` | Next.js on `127.0.0.1:4317` |
| `build` / `start` | Production build/start (same bind) |
| `lint` | ESLint |
| `db:generate` / `db:push` / `db:migrate` / `db:seed` / `db:studio` | Drizzle + seed |
| `test` / `test:watch` | Vitest (packages config) |
| `test:e2e` | Playwright |
| `topology` | CLI |
| `mcp` | MCP stdio server |

### `docker-compose.yml` services

| Service | Notes |
| --- | --- |
| `postgres` | `postgres:16-alpine`, port `54329→5432`, volume `topology_pgdata`, **Postgres-only healthcheck** (`pg_isready`) |
| *(no app service)* | No Topology web container, no attachment/uploads volume |

### Drizzle tables relevant to users / workspaces / members / comments / attachments

**Present (auth + attribution):**

- `users` — id, name, email, emailVerified, image, **passwordHash**, themePreference, createdAt
- `accounts`, `sessions`, `verification_tokens` — Auth.js adapter tables
- Attribution FKs only: `cases.createdById`, `runs.createdById`, `runResults.executedById`, `linkedIssues.createdById`, `apiTokens.userId`

**Absent:**

- `workspaces` / `organizations`
- `workspace_members` / invites / roles enum
- `comments` / `result_comments`
- `attachments` / file metadata tables

**Nearby but not comments/attachments:**

- `run_results.notes` (plain text on result)
- `triage_items.notes` (plain text on triage item)
- `runs.description` (run-level notes in create UI)

All tables today: `users`, `accounts`, `sessions`, `verification_tokens`, `folders`, `cases`, `runs`, `run_results`, `run_shards`, `api_tokens`, `milestones`, `triage_items`, `linked_issues`.

---

## 1. OAuth-first login UX

### Exists

| Path | Description |
| --- | --- |
| `src/auth.ts` | Conditionally registers GitHub + Google when `AUTH_*_ID/SECRET` set; always registers Credentials (bcrypt vs `users.passwordHash`) |
| `src/auth.config.ts` | `pages.signIn = "/login"`; JWT sessions; middleware allows `/login`, `/api/auth`, `/api/ci`, `/api/agent` unauthenticated |
| `src/app/login/page.tsx` | Redirects if session; passes `oauth.github` / `oauth.google` flags from env |
| `src/components/login-form.tsx` | “Continue with GitHub/Google” when configured; divider “or email”; email/password always shown; prefilled demo creds |
| `src/types/next-auth.d.ts` | Extends session with `user.id` |
| `src/components/providers.tsx` | `SessionProvider` |
| `.env.example` / `README.md` | Documents optional OAuth env vars |
| `src/db/seed.ts` | Seeds demo email/password user for local/credentials path |

### Missing / incomplete

- **Not OAuth-primary in UX:** email fields are always visible; no collapsed secondary path labeled **“Use email instead”**.
- **No explicit air-gap mode:** credentials work when OAuth env is unset (de facto offline path), but there is no dedicated “air-gapped / credentials-only” copy, flag, or docs section naming air-gap.
- OAuth account linking / first-login provisioning edge cases not documented; JWT strategy + Drizzle adapter mix is scaffolding-level (`README`: “Auth scaffolding”).
- E2E still expects copy that may drift (`e2e/smoke.spec.ts` looks for `Demo:` while login form shows `demo@topology.local / topology-demo`).

### Key files to touch

- `src/components/login-form.tsx`, `src/app/login/page.tsx`
- `src/auth.ts`, `src/auth.config.ts`
- `.env.example`, `README.md`
- `e2e/smoke.spec.ts`

**Verdict:** Partial — providers wired; UX not yet OAuth-first + secondary email + named air-gap.

---

## 2. Workspace invites + roles (admin / member / viewer); assign cases / run items

### Exists

| Path | Description |
| --- | --- |
| `src/components/hub-shell.tsx` | Nav label **“Workspace”** only (not a tenancy model) |
| Schema attribution | `createdById` / `executedById` record who created/executed — **not** assignees or RBAC |
| Settings | Profile/password/theme/MCP/CI — no members/invites section (`settings-workspace.tsx`) |
| Data model | **Global single-tenant** — cases/runs/folders have no `workspaceId` |

### Missing / incomplete

- No `workspaces`, `workspace_members`, `invites`, or `role` enum (`admin` / `member` / `viewer`).
- No invite email/token flow, accept-invite UI, or API.
- No permission checks beyond “logged in” (session) or bearer token (CI/agent).
- No assignee columns on cases or run results; cannot “assign cases/run items” even where schema “allows” — **schema does not allow** assignees today.
- No Settings → Members UI.

### Key files to touch

- **Schema/migrations:** `src/db/schema.ts`, `drizzle/*.sql`, `src/db/migrate.ts`
- **Authz helpers:** new lib (e.g. `src/lib/workspace-auth.ts`) + wire into `src/app/api/**`
- **API:** new `/api/workspaces`, `/api/invites`, `/api/members` (none exist)
- **UI:** settings members panel; case/run assignee pickers in `cases-workspace.tsx`, `runs-workspace.tsx`, `run-executor.tsx`
- **Seed:** multi-user demo memberships in `src/db/seed.ts`

**Verdict:** Absent (greenfield). Hub “Workspace” is naming only.

---

## 3. Result comments + basic attachments (local volume)

### Exists

| Path | Description |
| --- | --- |
| `run_results.notes` | Text column; PATCH `/api/runs/[id]` accepts `notes`; agent/CI also write notes |
| `triage_items.notes` | Separate triage notes field |
| `runs.description` | Labeled “Notes” on run create (`runs-workspace.tsx`) |
| CSV import | `FormData` multipart for case CSV only (`api/import/csv`) — not result attachments |
| Issue link path | Failed/blocked results → create/link issue (`run-executor.tsx`, `api/issues`) |

### Missing / incomplete

- **No comments entity** (threaded or multi-author discussion on a result).
- **Result notes UI gap:** `run-executor.tsx` types include `notes` and API supports them, but the executor UI does **not** expose a notes/comment editor (status + issue actions only).
- **No attachments:** no table, upload API, storage path, or compose volume for files.
- Compose has only `topology_pgdata`; no `./data/attachments` (or similar) bind mount.
- No MIME/size limits, download routes, or result↔file linkage.

### Key files to touch

- Schema: `result_comments`, `attachments` (+ FK to `run_results`)
- API: `src/app/api/runs/[id]/comments`, `.../attachments` (new)
- UI: `src/components/run-executor.tsx` (notes + comment list + upload)
- Ops: `docker-compose.yml` volume; env `ATTACHMENTS_DIR`; README
- Possibly reuse pattern from CSV `FormData` handling in `api/import/csv/route.ts`

**Verdict:** Notes column/API scaffolding only; comments + attachments absent; notes UI incomplete.

---

## 4. Seed data + docs for 15-minute success path

Target path: **compose up → OAuth/demo → hub → MCP snippet → CI → file issue**

### Exists

| Path | Description |
| --- | --- |
| `docker-compose.yml` | Postgres up |
| `src/db/seed.ts` | Demo user, API token, Smoke/Regression folders, 4 cases, milestone, planned run + results |
| `README.md` Quick start | compose → install → `db:push`/`db:migrate` → `db:seed` → `npm run dev` → demo login |
| README sections | OAuth optional, CLI JUnit, issue providers (mock), Connect agent / MCP, CI ingest setup |
| `packages/mcp/README.md` | Snippets for Cursor/Claude/Codex |
| UI | Settings → Connections (`connect-agent-panel.tsx`); Settings → CI (`ci-setup-panel.tsx`); Create issue on failed results |
| `packages/cli/examples/github-actions.yml` | CI example |
| `e2e/smoke.spec.ts` | Login + hub smoke |

### Missing / incomplete

- No single **numbered 15-minute** checklist that chains all steps end-to-end in one place (README pieces exist but are fragmented).
- OAuth is optional footnote, not part of the default success path; path is **credentials-demo-first**.
- No `CONTRIBUTING.md` pointing newcomers at seed + test + success path.
- Seed does not create a failed result + linked issue for “file issue” without UI clicks.
- No `docs/` directory for a dedicated getting-started guide.

### Key files to touch

- `README.md` (or new `docs/getting-started.md`)
- `src/db/seed.ts` (optional richer demo: failed result / mock issue)
- `packages/mcp/README.md` (cross-link)
- `CONTRIBUTING.md` (new)

**Verdict:** Strong bootstrap foundation (~70%); missing unified 15-min narrative and CONTRIBUTING.

---

## 5. Healthcheck, CONTRIBUTING test instructions, env docs for OAuth/tracker secrets

### Exists

| Path | Description |
| --- | --- |
| `docker-compose.yml` | **Postgres** `healthcheck` only |
| `.env.example` | `AUTH_SECRET`, `AUTH_URL`, GitHub/Google OAuth, demo user, `TOPOLOGY_API_TOKEN`, issue provider + commented Jira/Linear/GitHub secrets |
| `README.md` | OAuth + issue provider env mentions; scripts table includes `test` / `test:e2e` |
| `package.json` | `test`, `test:watch`, `test:e2e` |

### Missing / incomplete

- **No app health endpoint** (`/api/health` / `/healthz`) checking DB (and later attachments disk).
- **No compose healthcheck** for a Topology app service (no app service at all).
- **No `CONTRIBUTING.md`** with how to run unit/e2e tests, seed, required env.
- Env docs are good for local `.env.example` but not framed as “tracker secrets” / production checklist; no CONTRIBUTING cross-link.

### Key files to touch

- New `src/app/api/health/route.ts` (or `app/health/route.ts`)
- `docker-compose.yml` (optional `app` service + healthcheck + attachments volume)
- New `CONTRIBUTING.md`
- `.env.example` / `README.md` polish for OAuth + tracker secrets

**Verdict:** Env docs solid; healthcheck + CONTRIBUTING largely absent.

---

## Cross-cutting summary

| Requirement area | Status | Gap size |
| --- | --- | --- |
| 1. OAuth-first + email secondary + air-gap | Partial | UX/docs polish + air-gap naming |
| 2. Invites + roles + assign | Absent | Full schema + API + UI + authz |
| 3. Comments + attachments | Mostly absent | Schema + storage + UI; notes API unused in UI |
| 4. 15-min success path | Partial | Unify docs; optional richer seed |
| 5. Healthcheck + CONTRIBUTING + env | Partial | Health + CONTRIBUTING missing; env mostly done |

### Suggested implementation order (dependency-aware)

1. Login UX + air-gap docs + `/api/health` + `CONTRIBUTING.md` (low coupling)
2. Result notes UI → comments table → attachments volume/API
3. Workspaces/members/roles/invites + assignee fields (largest; touches nearly all APIs)
4. Fold into one 15-minute README path once pieces land

---

## Quick reference paths

```
src/auth.ts
src/auth.config.ts
src/middleware.ts
src/app/login/page.tsx
src/components/login-form.tsx
src/db/schema.ts
src/db/seed.ts
src/app/api/runs/[id]/route.ts
src/components/run-executor.tsx
src/components/settings-workspace.tsx
src/components/connect-agent-panel.tsx
src/components/ci-setup-panel.tsx
docker-compose.yml
.env.example
README.md
packages/mcp/README.md
e2e/smoke.spec.ts
```
