# CSV and attachment fixes

Date: 2026-09-17. No commit. Owned files only: `src/lib/csv.ts`, `src/app/api/import/**`, `src/app/api/attachments/**`, `src/app/api/results/[id]/attachments/**`, and unit tests.

## Fixed

1. **CSV records respect quotes.** `parseCasesCsv` no longer splits the file on newlines before quote handling. A quoted field can contain CR/LF, so an export of multiline steps round-trips as one case. A continuation line inside an open quote is not inserted as another case. Commas and doubled quotes inside a field are unchanged.

2. **Export neutralizes spreadsheet formulas.** `serializeCasesCsv` prefixes a cell with `'` when, after trim, it starts with `=`, `+`, `-`, or `@`, then quotes it. That includes the folder column and a tags cell that starts with those characters. Quoting alone is not used as the guard. Stored values are not rewritten; neutralization is on export.

3. **Unknown project id on CSV import and export.** `GET`/`POST /api/import/csv` now reject an explicit preferred project id (`x-topology-project-id`, otherwise the project cookie) before calling `requireProjectAccess`. Malformed id is **400**. A well-formed id that is not a membership is **404**. Omitted preference still uses the first accessible project.

   Shared helper, not edited: `pickAccessibleProject` / `requireProjectAccess` in `src/lib/project.ts` still fall back to the first accessible project. Other routes still inherit that fallback. Only this import/export route rejects the mismatch itself.

4. **Attachment download does not serve active types as documents.** `GET /api/attachments/:id` allowlists `image/png`, `image/jpeg` (including `image/jpg`), `image/gif`, `image/webp`, `application/pdf`, and `text/plain` for inline preview. Anything else, including HTML, XHTML, SVG, and script types, is `Content-Disposition: attachment`, `Content-Type: application/octet-stream`, and `X-Content-Type-Options: nosniff`. The stored client type is not echoed for those. Allowlisted responses also set nosniff. The response type is the canonical base type, not the raw stored string.

5. **Oversize uploads return 413.** `POST /api/results/:id/attachments` catches `formData()` failures (including proxy truncation of the body) and returns 413 `File exceeds 10 MB limit` instead of an empty 500. A declared body clearly over the 10 MB file cap plus framing is rejected the same way. `file.size` over the cap is 413. A missing file field and a 0-byte file are **400**. CSV multipart parse failures on import are 413; invalid JSON is 400.

   Shared limit, not edited: Next still buffers request bodies at the default 10 MB proxy cap (`proxyClientMaxBodySize`, see `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/proxyClientMaxBodySize.md`). That setting lives outside these files (`next.config` was not changed). A file that plus multipart framing exceeds that cap is no longer an empty 500; it is 413. Raising the proxy cap would be required before a file at the handler's 10 MB limit can be stored.

6. **Path and id handling.** Filename sanitizing in `src/lib/attachments.ts` is unchanged (slashes and other non-allowlisted characters are replaced; the storage key is a single segment). Download also refuses a storage key that does not stay as a direct child of the attachments root. Malformed attachment and result ids are **400** before the uuid query, not 500.

## Tests

`npx vitest run --config vitest.packages.config.ts src/lib/csv.test.ts src/app/api/attachments/safe-download.test.ts`

13 passed (quoted newline round-trip, continuation line is not a new case, formula prefix including folder names, download allowlist vs active types, storage-key containment). `test:e2e` was not run.

## Not changed

- Blank priority/status on a present column still fail the enum instead of defaulting. Not in the required set.
- Cases UI still treats HTTP 200 as full success and does not show import `errors` (`src/components/cases-workspace.tsx`, not owned).
- No CSV row or field budget.
- `src/lib/project.ts` fallback for every other route.
