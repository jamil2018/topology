# Case edit after creation — click → open → save path

Date: 2026-09-15. Repo: `/Users/jamil/Personal Projects/topology` @ `main`.

## Verdict

**Single-case edit does not exist.** KEY / title clicks open a **read-only History** side panel, not an editor. There is **no** case detail page, drawer, or modal for editing title/description/steps/etc., and **no** `PATCH/PUT /api/cases/[id]`. After create, the create panel closes and the list refreshes — there is no post-create edit flow.

Best hypothesis for the bug report: users expect KEY (e.g. `AUTO-a::one`, `button.hover:underline` mono accent) to open edit; it only opens history. That feels like a no-op / broken drawer. Permissions PR #29 is unlikely the primary cause unless the user is hitting **bulk** update without `cases.edit`.

---

## 1. Cases list UI — KEY / title click → navigation

| Role | Path |
|------|------|
| Route (RSC) | `src/app/cases/page.tsx` |
| Client workspace | `src/components/cases-workspace.tsx` |
| History panel | `src/components/case-history-panel.tsx` |
| Command palette jump | `src/components/command-palette.tsx` → `/cases?case=<uuid>` |

### KEY cell (matches bug repro styling)

```1222:1229:src/components/cases-workspace.tsx
                  <td className="px-3 py-2 font-mono text-xs text-[color:var(--topo-accent)]">
                    <button
                      type="button"
                      className="hover:underline"
                      onClick={() => setHistoryCase(c)}
                    >
                      {c.key}
                    </button>
```

### Title cell — same handler

```1231:1249:src/components/cases-workspace.tsx
                  <td className="px-3 py-2">
                    <button
                      type="button"
                      className="text-left"
                      onClick={() => setHistoryCase(c)}
                    >
                      <div className="font-medium text-[color:var(--topo-ink)]">
                        {c.title}
                      </div>
                      ...
                    </button>
                  </td>
```

Both only call `setHistoryCase(c)`. No `router.push`, no edit form, no modal.

### URL deep-link `?case=`

Seeded / synced into the **same** history state (not edit):

```104:119:src/components/cases-workspace.tsx
  const [historyCase, setHistoryCase] = useState<CaseRow | null>(() => {
    const caseParam = searchParams.get("case");
    if (!caseParam) return null;
    return initialCases.find((c) => c.id === caseParam) ?? null;
  });
  ...
    const caseParam = searchParams.get("case");
    if (caseParam) {
      const found = initialCases.find((c) => c.id === caseParam);
      if (found) setHistoryCase(found);
    }
```

Command palette:

```214:225:src/components/command-palette.tsx
    for (const c of resolvedHits.cases) {
      list.push({
        ...
        run: () => {
          router.push(`/cases?case=${c.id}`);
          close();
        },
      });
    }
```

**No** `/cases/[id]` route exists under `src/app/` (only `src/app/cases/page.tsx` + `loading.tsx`).

---

## 2. What opens after click — History panel (not edit)

Mounted when `historyCase` is set:

```1297:1304:src/components/cases-workspace.tsx
      {historyCase ? (
        <CaseHistoryPanel
          key={historyCase.id}
          caseId={historyCase.id}
          caseKey={historyCase.key}
          caseTitle={historyCase.title}
          onClose={() => setHistoryCase(null)}
        />
      ) : null}
```

`CaseHistoryPanel` (`src/components/case-history-panel.tsx`):

- Header label: **"History"**
- Displays `caseKey` / `caseTitle` as read-only text
- `GET /api/cases/${caseId}/activity` — timeline only
- Close button only — **no edit fields, no Save**

```31:71:src/components/case-history-panel.tsx
export function CaseHistoryPanel({ caseKey, caseTitle, caseId, onClose, ... }) {
  ...
  useEffect(() => {
    ...
    void fetch(`/api/cases/${caseId}/activity`)
```

### Create path (only full authoring UI)

Inline create panel (`showCreate` / `?new=1`): key, title, description, priority, status, folder, tags → `POST /api/cases` → panel closes → `router.refresh()`.

```316:352:src/components/cases-workspace.tsx
  async function createCase() {
    ...
    const res = await fetch("/api/cases", { method: "POST", ... });
    ...
    setShowCreate(false);
    setForm({ key: "", title: "", ... });
    startTransition(() => router.refresh());
  }
```

Create UI does **not** expose schema fields `preconditions`, `steps`, `expectedResult` (those exist on `cases` in `src/db/schema.ts` and CSV import).

### Bulk “edit” (metadata only)

Checkbox selection → bulk bar → `PATCH /api/cases` with `caseIds` + status / folder / tags (API also accepts priority; UI bulk priority select may vary). **Cannot** change key, title, description, steps, etc.

```282:314:src/components/cases-workspace.tsx
  async function bulkUpdate(patch: {
    status?: string;
    priority?: string;
    folderId?: string | null;
    tags?: string[];
    tagMode?: "replace" | "add";
  }) {
    ...
    await fetch("/api/cases", { method: "PATCH", body: JSON.stringify({
      caseIds: Array.from(selectedIds),
      ...patch,
    })});
```

UI does **not** gate create/bulk on `cases.create` / `cases.edit` (no permission checks in `cases-workspace.tsx`).

---

## 3. API routes for updating cases

| Method | Path | File | Behavior |
|--------|------|------|----------|
| GET | `/api/cases` | `src/app/api/cases/route.ts` | list |
| POST | `/api/cases` | same | create; action `cases.create` |
| PATCH | `/api/cases` | same | **bulk only** (`bulkUpdateSchema`: `caseIds` + status/priority/folderId/tags); action `cases.edit` |
| GET | `/api/cases/[id]/activity` | `src/app/api/cases/[id]/activity/route.ts` | activity log; membership only (no `cases.view` action gate) |
| — | `/api/cases/[id]` | **missing** | no GET/PATCH/PUT/DELETE |

Bulk schema explicitly excludes content fields:

```31:38:src/app/api/cases/route.ts
const bulkUpdateSchema = z.object({
  caseIds: z.array(z.string().uuid()).min(1).max(500),
  status: z.enum(["draft", "ready", "blocked", "deprecated"]).optional(),
  priority: z.enum(["P0", "P1", "P2", "P3"]).optional(),
  folderId: z.string().uuid().nullable().optional(),
  tags: z.array(z.string()).optional(),
  tagMode: z.enum(["replace", "add"]).optional().default("replace"),
});
```

**No DELETE** for cases anywhere under `src/app/api/cases/` (`cases.delete` exists in the catalog but is unused on case routes).

### Other writers

- CSV import (`src/app/api/import/csv/route.ts`): **skips** duplicate keys — does not update
- Agent/MCP: `create_case` only (`packages/mcp` README: `list_cases` / `create_case`; no update)

---

## 4. Permissions (PR #29 / `1a3a62c`)

Commit `1a3a62c` (`feat(auth): enforce action permissions…`, merged as PR #29) changed cases route gates:

- POST: `write: true` → `action: "cases.create"`
- PATCH (bulk): `write: true` → `action: "cases.edit"`

Catalog / system roles (`src/lib/permissions.ts`):

- `cases.edit` in ACTION_CATALOG
- **member** and **admin** include `cases.edit`; **viewer** does not
- Custom roles: only actions listed on the role (a role with `cases.create` but not `cases.edit` can create but fail bulk PATCH with `403 Missing permission: cases.edit`)

Enforcement: `requireProjectAccess` → `checkAccessOptions` in `src/lib/project.ts`.

**Relevance to bug:** Permissions can block **bulk** metadata updates for custom/viewer roles. They do **not** explain KEY-click “edit” failing — that path never calls a write API.

---

## 5. Gaps in internal docs

| Doc | Says | Stale / missing |
|-----|------|-----------------|
| `internal/cases-folders-exploration.md` | No single-case GET/PATCH/DELETE; bulk PATCH only; KEY opens history via `?case=` | Accurate on API; does not spell out “KEY looks like edit but is history-only” as a product bug |
| `internal/linear-ux-gap-analysis.md` | “case detail page itself is also missing — list + create only”; “No case PATCH” | **Stale**: bulk PATCH + history + saved views later landed (`b82d356`); still correctly flags **missing single-case edit/detail** |
| `internal/auth-membership-permissions-report.md` | Cases POST/PATCH write gating; UI not fully read-only for viewers | Pre-/partial custom-role era wording (`write: true`); does not discuss missing single-case edit |
| — | — | **No** dedicated doc for post-create case editing UX |

---

## 6. Existing tests

| File | Covers |
|------|--------|
| `src/lib/case-list.test.ts` | filter/sort/paginate helpers |
| `src/lib/case-activity.test.ts` | activity summary formatting + saved-view config |
| `src/lib/run-case-picker.test.ts` | run picker list helpers |
| `src/lib/project.test.ts` | custom-role action resolution (viewer lacks `cases.create`); **no** API route tests for case PATCH |
| `packages/mcp/src/client.test.ts` | `create_case` only |

**No** tests for single-case update, edit UI, or `PATCH /api/cases` bulk handler.

---

## Click → open → save path (actual)

```
Cases table KEY or title button
  → setHistoryCase(c)
  → CaseHistoryPanel mounts (aside “History”)
  → GET /api/cases/:id/activity
  → render timeline (or empty “No changes recorded yet.”)
  → ✗ no edit form, no Save, no PATCH for content fields

Create (“Save case”)
  → POST /api/cases (cases.create)
  → close create panel + refresh list
  → ✗ does not open editor for the new case

Bulk bar (checkboxes)
  → PATCH /api/cases { caseIds, status|folderId|tags|… } (cases.edit)
  → refresh
  → ✗ cannot edit title/description/steps/key
```

---

## Hypothesis ranking

1. **Primary (feature gap):** KEY/title affordance implies case detail/edit; implementation opens read-only history. Users report click no-op / broken drawer/modal.
2. **Secondary:** After create, no path to edit content fields (especially `steps` / `preconditions` / `expectedResult`, never in create UI either) — CSV skip-on-duplicate and no single-case PATCH leave no product update path.
3. **Tertiary (permissions):** Custom role missing `cases.edit` → bulk PATCH 403. Unrelated to KEY click unless misattributed.

**Fix direction (out of scope here):** Add case detail/edit surface + `PATCH /api/cases/[id]` (or extend create panel into edit mode), wire KEY/title/`?case=` to it; keep history as a tab/section; optionally gate UI with `cases.edit`.
