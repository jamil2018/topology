# Cases / Suites & Folders — codebase exploration

Date: 2026-09-13. Repo: `/Users/jamil/Personal Projects/topology`.

## Verdict

**Nested folders are already in the data model and create/delete APIs (`parentId`), but the Cases UI treats folders as a flat list.** No folder-tree component exists. Implementing a nested folder tree is primarily a UI + query plumbing change; schema change is optional (self-FK + cycle guards recommended, not required to ship UI).

---

## 1. Cases (Suites) page — routes & components

| Role | Path | Lines |
|------|------|-------|
| Route (RSC) | `src/app/cases/page.tsx` | 1–43 |
| Main client UI | `src/components/cases-workspace.tsx` | 1–1267 |
| List filter/sort/page helpers | `src/lib/case-list.ts` | 1–139 |
| Saved view config | `src/lib/saved-views.ts` | 5–53 |
| Saved views UI | `src/components/saved-views-bar.tsx` | — |
| Case history side panel | `src/components/case-history-panel.tsx` | — |
| Page chrome | `src/components/page-header.tsx` | 1–37 |
| Shell / nav | `src/components/hub-shell.tsx` | 27–36 (`/cases`, label “Test Cases”, hint “Suites”) |
| Command palette deep-links | `src/components/command-palette.tsx` | `/cases?new=1`, `?case=`, `?folder=` |

**Naming:** Product language mixes “Cases”, “Suites”, and “folders”. Page eyebrow is `"Suites"`, title `"Cases"` (`cases-workspace.tsx` 445–448). Nav: “Test Cases” / hint “Suites”.

**Page data load** (`src/app/cases/page.tsx` 12–39):

```ts
listCases() + listFolders() + listSavedViews("cases", userId)
// Cases mapped to: { id, key, title, priority, status, tags, folder: {id,name}|null }
// Folders mapped to: { id, name }  // parentId stripped
```

**URL query params consumed by `CasesWorkspace`:**

- `?folder=<uuid>` — folder filter
- `?new=1` — open create-case panel
- `?case=<uuid>` — open history panel for that case

---

## 2. Folder dropdown filter (current)

**Location:** `src/components/cases-workspace.tsx` 654–697

**Implementation:** HeroUI `ComboBox` + `ListBox`, not chips (CSV template text still says “folder chip”).

- State: `folderFilter` (`"all"` | folder uuid), seeded from `searchParams.get("folder")` (79–81, 105–106)
- Options: `All (N)` then flat `folders.map` with per-folder case counts
- Counts: only direct `c.folder.id` matches — **no descendant rollup** (140–147)
- Filtering: client-side via `filterAndSortCases` → `filterCases` exact folder id match (`src/lib/case-list.ts` 44–46)
- When a folder is selected: “Manage” dropdown → Rename / Delete (763–794)

**Also flat folder selects elsewhere on same page:**

- Bulk “Move folder” (850–881)
- Create-case Folder `Select` (1011–1044)

**Related (Runs picker):** `src/components/run-case-picker-table.tsx` 176–205 — `Select` “Folder / suite”, same flat list; filter in `src/lib/run-case-picker.ts` 66–68.

---

## 3. Data model / schema

### `folders` — `src/db/schema.ts` 168–174

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid PK | `defaultRandom()` |
| `name` | text NOT NULL | |
| `parentId` | uuid nullable | column `parent_id` — **no `.references()` self-FK** |
| `createdAt` / `updatedAt` | timestamp | |

### Relations — `src/db/schema.ts` 480–486

```ts
foldersRelations: {
  cases: many(cases),
  parent: one(folders, { fields: [folders.parentId], references: [folders.id] }),
  // no explicit `children: many(...)` relation declared
}
```

### `cases` — `src/db/schema.ts` 176–198

| Field | Notes |
|-------|-------|
| `key` | unique text |
| `title`, `description`, `preconditions`, `steps`, `expectedResult` | text |
| `priority` | enum P0–P3 (default P2) |
| `status` | enum draft/ready/blocked/deprecated (default draft) |
| `folderId` | uuid → `folders.id`, **ON DELETE SET NULL** |
| `tags` | text[] |
| `createdById`, `assigneeId` | optional users |
| timestamps | created/updated |

### Also references folders

- `milestones.folderId` — `schema.ts` 310–312 (suite scope for gates)

### Types

```ts
export type Case = typeof cases.$inferSelect;   // schema.ts 647
export type Folder = typeof folders.$inferSelect; // schema.ts 648
```

UI-local types in `cases-workspace.tsx` 44–53 omit `parentId`.

### Migrations

Drizzle SQL under `drizzle/` starts at `0001_linked_issues.sql` — **no migration creates `folders`/`cases`**. Base tables appear to be managed via Drizzle schema push / external bootstrap. Incremental migrations do not touch `parent_id`. Seed creates flat folders only (`src/db/seed.ts` 83–90: “Smoke”, “Regression”).

---

## 4. API routes — cases & folders

### Folders

| Method | Path | File | Body / behavior |
|--------|------|------|-----------------|
| GET | `/api/folders` | `src/app/api/folders/route.ts` 14–21 | `{ folders }` via `listFolders()` (full rows including `parentId`) |
| POST | `/api/folders` | same 23–79 | `{ name, parentId?: uuid \| null }` → `{ folder }` 201; uniqueness **per parent** (case-insensitive name) |
| PATCH | `/api/folders/[id]` | `src/app/api/folders/[id]/route.ts` 14–81 | `{ name }` only — **cannot reparent** |
| DELETE | `/api/folders/[id]` | same 83–121 | Children promoted to root (`parentId: null`); cases/milestones SET NULL |

### Cases

| Method | Path | File | Notes |
|--------|------|------|-------|
| GET | `/api/cases?folderId=` | `src/app/api/cases/route.ts` 39–49 | optional exact folder filter |
| POST | `/api/cases` | 51–102 | create; validates folder exists |
| PATCH | `/api/cases` | 105–233 | **bulk** only: `caseIds[]` + status/priority/folderId/tags |
| GET | `/api/cases/[id]/activity` | `src/app/api/cases/[id]/activity/route.ts` | activity log only |

**No** single-case GET/PATCH/DELETE routes.

### CSV

| Method | Path | File |
|--------|------|------|
| GET | `/api/import/csv` | export all cases |
| POST | `/api/import/csv` | import multipart `file` or JSON `{ csv }` |
| GET | `/api/import/csv/template` | sample template |

### Search

`GET /api/search?q=` — folders by `ilike(name)` only (`id`, `name`); no `parentId` (`src/app/api/search/route.ts` 43–51).

### Queries

- `listCases(folderId?)` — `src/lib/queries.ts` 218–229; exact `folderId`, `with: { folder: true }`
- `listFolders()` — 232–235; `orderBy: name`; returns all columns including `parentId`

---

## 5. Nested folders / `parentId` status

| Layer | Nested support? |
|-------|-----------------|
| Schema column `parentId` | **Yes** |
| Drizzle `parent` relation | **Yes** |
| POST create with `parentId` | **Yes** (API) |
| DELETE promotes children | **Yes** (aware of nesting) |
| PATCH reparent | **No** |
| UI create/filter/display | **No** (always flat; create omits `parentId`) |
| Page props pass `parentId` | **No** (stripped to `{id,name}`) |
| Filter includes descendants | **No** |
| CSV folder paths | **No** (flat name match; creates root folders) |
| Folder tree component | **None** |

---

## 6. Filters, bulk selection, CSV on Cases page

### Filters (client-side on `initialCases`)

| Filter | State | Logic |
|--------|-------|-------|
| Folder | `folderFilter` | exact folder id (`case-list.ts` 44–46) |
| Status | `statusFilter` | exact |
| Priority | `priorityFilter` | exact |
| Search | `search` | substring over title/key/id/priority/status/folder name/tags |
| Sort | `sort` / `sortDir` | key, title, folder, priority, status |
| Pagination | page size 10 | `CASE_LIST_PAGE_SIZE` |

Saved views persist the above via `caseViewConfigSchema` (`saved-views.ts` 5–14).

### Bulk selection

- Per-row + page checkboxes (`cases-workspace.tsx` 216–235, 1100–1107, 1171–1178)
- Bulk bar (814–915): set status, move folder, add tags (`tagMode: "add"`), clear
- API: `PATCH /api/cases` with `bulkUpdateSchema` (cases route 30–37, 105–233)
- Priority bulk UI not exposed (API supports it)

### CSV import/export

- UI: Dropdown Template / Export / Import (`cases-workspace.tsx` 477–535, 430–441)
- Columns: key, title, description, preconditions, steps, expectedResult, priority, status, **folder** (name), tags (`src/lib/csv.ts`)
- Import creates missing folders by **flat name** at root (`import/csv/route.ts` 68–89)
- Duplicate case keys skipped
- Fixture: `fixtures/sample-cases.csv`

---

## 7. UI patterns

**HeroUI (`@heroui/react`) on Cases page:**

`Button`, `Input`, `TextArea`, `Chip`, `Label`, `TextField`, `ListBox`, `Select`, `ComboBox`, `Modal`, `Dropdown`, `useOverlayState`

**Other:** Motion (`motion` / `AnimatePresence`), Phosphor icons, CSS vars `--topo-*`, `PageHeader` + `StatusChip`, bordered panel/table (`rounded-md border … bg-[color:var(--topo-panel)]`), mono uppercase table headers.

**Layout convention:** HubShell → PageHeader (eyebrow/title/actions) → filter row → SavedViewsBar → optional bulk/create panels → table (+ optional history column).

**Related HeroUI elsewhere:** `Disclosure` in `runs-workspace.tsx` (collapsible create-run) — not a folder tree.

---

## 8. Existing folder tree components

**None.** Grep found no `Tree` / `FolderTree` / folder-path UI. Closest patterns:

- Flat `ComboBox` / `Select` + `ListBox` folder pickers
- `Disclosure` for unrelated expand/collapse
- Report “suite / folder” breakdown charts (`report-charts.tsx` `SuiteBars`) — analytics, not navigation

---

## Recommendation — nested folder tree with minimal schema change

**Ship UI on existing `parentId` — no migration required for MVP.**

1. **Pass `parentId` through** `cases/page.tsx` (and runs page / picker) as `{ id, name, parentId }`.
2. **Add a pure helper** e.g. `src/lib/folder-tree.ts`: `buildFolderTree`, `folderDescendantIds`, indented path labels, cycle detection for move.
3. **UI options (smallest → richest):**
   - **A.** Keep ComboBox; indent labels (`"  └ Child"`) / path (`"Smoke / Auth"`) — least layout change.
   - **B.** Left sidebar tree (Disclosure/buttons) + keep table — clearest nested UX; matches “suites” mental model.
4. **Create folder:** POST already accepts `parentId`; wire parent = current filter (or picker).
5. **Filter semantics:** decide exact-only (today) vs include descendants via `folderDescendantIds` in `filterCases`.
6. **API follow-ups (small):** PATCH `{ parentId }` with cycle/self checks; optional self-FK on `parent_id`; CSV `folder` as path (`A/B/C`) with create-along-path.
7. **Defer:** materialized path/ltree, `children` relation, workspace scoping.

**Avoid:** new adjacency table or replacing `folderId` on cases — current model is already correct for nesting.
