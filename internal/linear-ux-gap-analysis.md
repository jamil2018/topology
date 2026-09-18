# Linear-like UX gap analysis (Topology)

Explored: working tree `cursor/case-picker-toolbar-d945` + comparison to `origin/main` (ahead of local `main`). Date context: 2026-09-13.

## Tech stack

| Layer | Choice |
| --- | --- |
| App | Next.js **16.3.5** App Router, React 19, TypeScript |
| UI | Tailwind CSS v4, HeroUI v3, motion.dev, Geist |
| DB | Postgres + **Drizzle ORM** (`drizzle-orm` / `drizzle-kit`) |
| Auth | Auth.js (next-auth v5) |
| Packages | `@topology/domain`, `@topology/cli`, `@topology/mcp`, `@topology/issue-providers` |
| Tests | Vitest + Playwright |

**Schema:** `/Users/jamil/Personal Projects/topology/src/db/schema.ts`  
**Migrations:** `/Users/jamil/Personal Projects/topology/drizzle/*.sql` + `src/db/migrate.ts`  
**Config:** `/Users/jamil/Personal Projects/topology/drizzle.config.ts`

### Schema tables (all)

`users`, `accounts`, `sessions`, `verification_tokens`, `folders`, `cases`, `runs`, `run_results`, `run_shards`, `api_tokens`, `milestones`, `triage_items`, `linked_issues`

**Not in schema:** saved views, activity/audit events, shared steps entities, command-palette state.

Enums: `case_priority`, `case_status`, `run_status`, `result_status`, `run_kind`, `triage_status`, `milestone_status`, `theme_preference`, `issue_provider`, `issue_remote_status`.

---

## Key file paths

### Cases
- UI: `src/components/cases-workspace.tsx`
- Page: `src/app/cases/page.tsx`
- API: `src/app/api/cases/route.ts` (GET list, POST create only)
- CSV: `src/app/api/import/csv/route.ts`, `src/lib/csv.ts`
- Queries: `src/lib/queries.ts` (`listCases`, etc.)

### Runs
- UI: `src/components/runs-workspace.tsx`, `src/components/run-executor.tsx`
- Pages: `src/app/runs/page.tsx`, `src/app/runs/[id]/page.tsx`
- API: `src/app/api/runs/route.ts`, `src/app/api/runs/[id]/route.ts`
- Client filter helpers: `src/lib/run-case-picker.ts`, `src/lib/run-list.ts`

### Folders
- API: `src/app/api/folders/route.ts`
- On **origin/main** also: `src/app/api/folders/[id]/route.ts` (PATCH rename, DELETE)

### Shell / chrome
- `src/components/hub-shell.tsx`, `src/components/page-header.tsx`, `src/components/status-chip.tsx`

### Domain
- `packages/domain/src/{pulse,readiness,flake,triage,junit}.ts`

---

## Existing patterns

### Dialogs / overlays
- **Current branch:** mostly inline panels + `window.prompt` for new folder; HeroUI `Select`/`Disclosure`; Escape closes mobile nav only.
- **origin/main:** HeroUI `Modal` + `useOverlayState` for New/Rename/Delete folder (`cases-workspace.tsx`). Established pattern to reuse for palette / bulk confirm.

### Filters / sorts (ephemeral, client-only)
- **Cases (origin/main):** `src/lib/case-list.ts` — folder + search + column sort + pagination helpers; not persisted.
- **Cases (this branch):** folder chip filter only.
- **Run create picker:** status/priority/folder/tag/search/sort + multi-select (`run-case-picker.ts`).
- **Run list:** search/sort/paginate when list is long (`run-list.ts`).

### Mutations
- Client `fetch` + Zod-validated route handlers + `router.refresh()` / `useTransition`.
- PATCH exists for: settings, triage, run results (`/api/runs/[id]`), folders `[id]` (main only).
- **No** case PATCH/PUT/DELETE; **no** bulk case endpoints.
- Agent/MCP search: `/api/agent?resource=cases&q=` (token auth) — closest thing to global search, not a UI palette.

---

## Feature gap analysis

### 1. Command palette (Cmd+K / Ctrl+K)

| | |
| --- | --- |
| **Exists** | Nothing. No `cmdk`/kbar dep. Only Escape-to-close mobile drawer. Explicit debt note in `internal/ui-redesign-notes.md`: “No keyboard command palette yet”. |
| **Schema** | N/A |
| **Gap** | Full feature: global shortcut, searchable actions/navigation/entities, keyboard nav. Closest reuse: agent `q` search + Modal pattern on main. |

**Verdict:** Absent (documented intentional gap).

### 2. Saved views

| | |
| --- | --- |
| **Exists** | Ephemeral UI filters only (cases folder/search/sort on main; run picker filters; run list filters). No named views, URL-encoded view state, or shareable presets. |
| **Schema** | No `saved_views` / preferences-for-views table. `users.theme_preference` is the only user preference column. |
| **Gap** | Persist filter+sort(+columns) per user/workspace; apply to Cases and Runs lists; optional shared views. |

**Verdict:** Absent. Filter UX is a foundation only.

### 3. Bulk edit / move

| | |
| --- | --- |
| **Exists** | Multi-select **only** in Start-a-run case picker → creates `run_results` rows. Not for editing cases. Cases table has no checkboxes / bulk bar. |
| **API** | No bulk update. Cases create-only. Folders rename/delete on main (single folder). |
| **Gap** | Case multi-select; bulk status/priority/tags/folder; optional bulk deprecate/delete; API `PATCH` many-by-id. |

**Verdict:** Multi-select pattern exists for run creation only; bulk case edit absent.

### 4. Case history (activity / audit)

| | |
| --- | --- |
| **Exists** | Timestamps (`created_at` / `updated_at`) + `created_by_id` on cases/runs; `executed_at` / `executed_by_id` on results. Flake detection uses **result** history (`run_results`), not case field changes. “Run history” in copy means CI/manual run list, not audit trail. |
| **Schema** | No `activity_events`, `case_revisions`, or audit log table. |
| **Gap** | Event log (who/when/what changed), revision diffs, UI timeline on case detail (case detail page itself is also missing — list + create only). |

**Verdict:** Absent. Only crude timestamps / execution history.

### 5. Shared steps

| | |
| --- | --- |
| **Exists** | `cases.steps` is a **plain `text` field** (freeform). Same in CSV import/export, seed, MCP/agent create, run executor display. |
| **Schema** | No `shared_steps`, join table, or step ordering entity. |
| **Half-built?** | **No** — not a stubbed feature. It’s intentionally unstructured text, not an incomplete shared-step library. |
| **Gap** | Full CRUD library + attach/reference steps on cases (composition), versioning if desired. |

**Verdict:** Feature absent; current steps = markdown-ish blob per case.

### 6. (Cross-cutting) Linear-like density shell

| | |
| --- | --- |
| **Exists** | Sidebar hub, dark mode, dense tables, status chips, issue linking (Linear as **issue provider**, not UX clone). |
| **Gap** | The five features above; also case edit/detail, richer keyboard shortcuts. |

---

## Branch situation

| Ref | Notes |
| --- | --- |
| **Current checkout** | `cursor/case-picker-toolbar-d945` @ `fc99a1c` — run list collapse/pagination + case picker toolbar polish. Tracks `origin/cursor/case-picker-toolbar-d945`. |
| **Local `main`** | `93b7308` — **behind** `origin/main`. |
| **`origin/main`** | `afdf243` — Merge PR #9 brand icon. Includes merged work: case picker toolbar (#1), new-folder modal + CSV template (#2), settings topbar (#3), cases picker table (#4), hub bento (#5), test reports (#6), folder ComboBox rename/delete (#7), case-picker polish (#8), brand (#9). |
| **Related feature branches** | Mostly UI polish around runs/cases/folders/settings/reports — **none** named for palette, views, bulk edit, history, or shared steps. Grep across branches: no commits for those features. |

**Implication:** Gap analysis for the five Linear UX features is the same on this branch and on `origin/main`. Main is ahead on cases list UX (search/sort/Modal/folder CRUD) and reports — still no saved views / palette / bulk case edit / history / shared steps.

---

## Reuse map if building next

1. **Palette** → HeroUI Modal (main) + `/api/agent` search shape + hub nav list in `hub-shell.tsx`.
2. **Saved views** → extract filter state from `case-list.ts` / `run-case-picker.ts` / `run-list.ts`; new Drizzle table.
3. **Bulk edit** → Checkbox pattern from `runs-workspace.tsx`; need case PATCH + bulk route.
4. **History** → greenfield table; optionally mirror Linear “activity”.
5. **Shared steps** → greenfield; migrate off `cases.steps` text or keep blob + optional library refs.
