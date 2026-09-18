# UI walkthrough

Live pass against `http://127.0.0.1:4317` (email/password, OAuth unset). Dedicated Playwright Chromium, `userDataDir=/tmp/bughunt-ui`. Login as `demo@topology.local` landed on Hub (`Quality pulse`). No source fixes.

Highest severity: invalid ids crash and print SQL into the product UI, and a double-clicked Save case does the same.

## Highest-severity findings

1. **High — bad run/report ids throw and leak SQL (HTTP 200).** `/runs/not-a-uuid` and `/reports/not-a-uuid` do not 404. Postgres rejects the id (`invalid input syntax for type uuid`) and the page stays 200. Reports render that query in the in-app alert, including workspace id `3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf`. The run error overlay also includes the `users.password_hash` column in the failed query.
2. **High — double-click Save case fires four POSTs and shows a raw insert query.** Button is not disabled until after the request. Duplicate key is not turned into “Case key already exists”; the page shows `Failed query: insert into "cases"…`. One row was created (`BUGHUNT-800747`).
3. **Medium — missing-but-valid UUIDs are soft 404s (HTTP 200).** `/runs/00000000-0000-0000-0000-000000000000` and the reports equivalent render “This page could not be found” inside the app shell with status 200. The run miss also throws a client `Performance.measure` error (`RunDetailPage` negative timestamp).
4. **Medium — command palette does not trap focus, and null-byte search 500s.** Palette is `aria-modal` but Shift+Tab leaves it and focuses the page behind it (Delete controls, and the Next dev badge in this session). `GET /api/search?q=%00` returns 500 with an empty body; the palette only says “No matching commands”. Rapid Meta+K (12 presses) left the dialog open.

## Page matrix

Status is the document response from `page.goto` (and confirmed with `fetch` for the bad ids). “Overlay” on healthy pages is the Next.js dev tools portal, not an app error. Console noise of “Failed to load resource” is omitted when it only repeats the document status.

| Page | HTTP | Final URL | Visible error | Console / page errors | Failed network |
| --- | --- | --- | --- | --- | --- |
| `/` | 200 | `/` | none (h1 Quality pulse) | none | none |
| `/cases` | 200 | `/cases` | none | none | none |
| `/runs` | 200 | `/runs` | none | none | none |
| `/runs/new` | 200 | `/runs/new` | none | none | none |
| `/automation` | 200 | `/automation` | none | none | none |
| `/triage` | 200 | `/triage` | none | none | none |
| `/milestones` | 200 | `/milestones` | none | none | none |
| `/reports` | 200 | `/reports` | none | none | none |
| `/settings` | 200 | `/settings` | none | none | none |
| `/login` while authed | 200 | `/` (redirect) | none | none | none |
| `/connect` | 200 | `/settings?section=integrations#connections` | none | none | none |
| `/does-not-exist` | 404 | same | “This page could not be found.” | resource 404 | GET 404 |
| `/runs/not-a-uuid` | **200** | same | “This page couldn’t load” + dev overlay SQL | pageerror: failed `select` on `runs`, cause `invalid input syntax for type uuid` | none (error is the document render) |
| `/reports/not-a-uuid` | **200** | same | **alert:** “Reports failed to load” + full `Failed query` + workspace id in params | console error with the same query | none |
| run detail | 200 | `/runs/4d9c2c0d-d3e9-4f6b-a8f4-634b34d8bf26` | none (first run link: “BUGHUNT-RUNS race”) | none | none |
| report detail | 200 | `/reports/6424a6bd-bc77-4fd3-ba44-317afbf45333` | none | none | none |
| `/runs/00000000-0000-0000-0000-000000000000` | **200** | same | in-shell “404 This page could not be found.” | pageerror: `Performance.measure` negative timestamp on `RunDetailPage` | none |
| `/reports/00000000-0000-0000-0000-000000000000` | **200** | same | in-shell 404 | none | none |
| `/cases?new=1` | 200 | same | create form opens | none | none |
| `/settings?section=not-a-section` | 200 | same | falls back, no error | none | none |
| `/cases?folder=not-a-uuid` | 200 | same | no crash; tree unchanged | none | none |
| `/cases?case=not-a-uuid` | 200 | same | no history panel (unknown id ignored) | none | none |

## Break attempts

### Command palette (Search / Meta+K)

- Empty query: 11 items (Create case, Start run, File issue, plus nav). No request.
- `<script>`, `' OR 1=1 --`, `../../etc/passwd`, 4000 `a`s: dialog stays up, “No matching commands”, no alert dialog (no XSS).
- `%_%`: 18 hits. `%` and `_` are live `ILIKE` wildcards, so a short pattern matches broadly. Same user can already see those rows; not an auth bypass.
- Null byte and the mixed payload that included `\u0000`: `GET /api/search` **500**, empty body. UI does not surface the failure.
- “Create case” navigates to `/cases?new=1`. The palette has no extra input for create arguments; bad input happens on the form.
- Rapid Meta+K ×12 (40ms): every sample still saw the dialog, and it was still open after the burst. Toggle is unreliable while the listener is rebound on `open`.

### Create / save

- Empty required fields: Save case, Create run, and milestone Create are disabled when key/title, name, or milestone name is empty. Forced click did not submit.
- Double-click Save case on `BUGHUNT-800747` / “bughunt case” plus a 10k description: **4** `POST /api/cases`. Page text included `Failed query: insert into "cases"`. Case count went 69 → 70 (one row, then unique-violation leak). API only maps errors whose message contains `unique` or `duplicate`; Drizzle’s wrapper is `Failed query: …`, so the raw query is returned as `{ error }` and rendered.
- Double-click Create run: **1** `POST /api/runs` (`bughunt-run-807025`). Navigation won the race. Notes field accepted and stored 10,000 `A`s (shown on the run).
- Double-click milestone Create: **1** `POST`. 10k name: input accepted all 10,000 characters; server returned a visible “Could not create milestone” (max 200). Empty name stayed disabled.
- Back after run create: `goBack` returned to `/runs/new` with an empty name and no second POST. Back after case create was inconclusive (history had already moved to `/milestones`).

### 10k paste

- Cases, first visible field (Key, `?new=1` open): value length 10,000, no truncation, no crash. List search also accepted 10,000 with no crash.
- Runs, first field (Search runs): length 10,000, no error. Run notes: 10,000 persisted.

### 375px

Hamburger is visible and opens Test Cases / Test Runs. New case, Start a run, milestone Create, and Search stay in the viewport. Create run on `/runs/new` sits below the fold (`y≈1334`) but the page scrolls to it — not a hidden primary action. Opening the drawer on `/cases` adds ~161px horizontal overflow; New case stayed on screen. No clearly broken layout.

### Keyboard and a11y

- Tab order reaches **New case**; Enter opens the form. The next 13 stops are New folder, CSV, filters, and saved-view rows including **Delete view** buttons, then the Key field (`TOP-12`). Save case is in the form after that, so submit is reachable, but delete controls come before the fields you just opened. That is a focus-order bug, not a hard trap.
- Palette: Tab walks options and stays inside. **Shift+Tab leaves the open dialog** on the first press (`aria-modal`, no focus trap). Confirmed on `/cases`: focus moved to background controls (Delete run/view in the earlier pass; Next.js dev badge in the screenshot). Escape still closes it.
- Folder tree has disabled unlabeled 20×24 spacer buttons (`text-transparent`). They are not the only way to create or delete. Run detail assignee `<select>` has no accessible name.
- No focus trap that strands the user. The bug is the opposite: the palette does not contain focus.

### Error boundary

Reports `error.tsx` **does** fire for `/reports/not-a-uuid` and prints `error.message` (the SQL) in `role="alert"`, with Try again / Back to runs. That is a product boundary, not only the Next overlay. Runs have no `error.tsx`, so Next shows “This page couldn’t load” plus the dev runtime overlay (source line `getRunWithResults`). A client `throw` without patching source was not separately injected; the invalid-id navigation is what triggers the boundary. Bad theme localStorage and a mocked settings JSON response were not completed (walk script died on a later folder click before those steps).

### Login

First navigation to `/login` showed the email form (OAuth unset). Sign in with the demo password reached `/`. A later session was already authenticated, so empty/wrong-password on a cold login was not repeated.

## Artifacts created (not cleaned up)

- Case `BUGHUNT-800747` “bughunt case” (10k description).
- Run `bughunt-run-807025` with a 10k note string.
- One milestone POST (`bughunt-ms-811414`); the heading was not visible before the next navigation.
- One additional case from the back-button attempt (key not recorded in the summary).

## Screenshots

- `internal/bug-hunt/screenshots/ui/runs-not-a-uuid-sql.png` — Next runtime overlay, failed select, `password_hash` in the query, stack at `runs/[id]/page.tsx`.
- `internal/bug-hunt/screenshots/ui/reports-not-a-uuid-sql.png` — in-app “Reports failed to load” alert with the query and workspace id in params.
- `internal/bug-hunt/screenshots/ui/palette-focus-escape.png` — palette open while focus sits on the dev-tools badge outside the dialog.

```json
[
  {
    "id": "UI-1",
    "severity": "high",
    "title": "Invalid run and report ids crash with SQL in the UI and HTTP 200",
    "pages": ["/runs/not-a-uuid", "/reports/not-a-uuid"],
    "evidence": "Document status 200 (goto and fetch). Reports alert shows Failed query plus workspace id 3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf. Run overlay includes users.password_hash and PostgresError invalid input syntax for type uuid. Cause: getRunWithResults/getRunReport compare a uuid column to an unvalidated param.",
    "screenshots": [
      "internal/bug-hunt/screenshots/ui/runs-not-a-uuid-sql.png",
      "internal/bug-hunt/screenshots/ui/reports-not-a-uuid-sql.png"
    ]
  },
  {
    "id": "UI-2",
    "severity": "high",
    "title": "Double-click Save case sends multiple POSTs and renders the raw insert query",
    "pages": ["/cases?new=1"],
    "evidence": "4 POST /api/cases for key BUGHUNT-800747. Page text included Failed query: insert into \"cases\". Case count 69 to 70. pending is not set until after the fetch; unique-violation mapping misses Drizzle's Failed query wrapper and returns the message as JSON error.",
    "screenshots": []
  },
  {
    "id": "UI-3",
    "severity": "medium",
    "title": "Unknown UUIDs are soft 404s; run miss also throws a client measure error",
    "pages": ["/runs/00000000-0000-0000-0000-000000000000", "/reports/00000000-0000-0000-0000-000000000000"],
    "evidence": "HTTP 200 with in-shell 404 copy. Run pageerror: Failed to execute 'measure' on 'Performance': 'RunDetailPage' cannot have a negative time stamp. Contrast: /does-not-exist is a real 404.",
    "screenshots": []
  },
  {
    "id": "UI-4",
    "severity": "medium",
    "title": "Command palette search 500s on a null byte and does not trap focus",
    "pages": ["/"],
    "evidence": "GET /api/search?q=%00 status 500 empty body; palette shows No matching commands. Shift+Tab with dialog open moved focus outside (Delete controls; Next dev badge). Rapid Meta+K x12 left the dialog open.",
    "screenshots": ["internal/bug-hunt/screenshots/ui/palette-focus-escape.png"]
  },
  {
    "id": "UI-5",
    "severity": "low",
    "title": "Create form is in tab order only after Delete view buttons; 10k run notes are stored",
    "pages": ["/cases", "/runs/new"],
    "evidence": "After Enter on New case, 14 tabs hit New folder, CSV, filters, and Delete view before the Key field. Save case is reachable after that. Run notes accepted 10000 characters and displayed them on the run. Milestone 10k name was rejected with Could not create milestone.",
    "screenshots": []
  }
]
```
