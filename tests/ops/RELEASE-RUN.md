# Release run — 2026-11-06

No-go. Executed P0 automated tests failed, including the release gate (`HAR-1` missing), the viewer New case control, serious and critical axe violations, and the manual-run case picker. VoiceOver, NVDA, ZAP, backup/restore, Lighthouse, Firefox, and WebKit were not run. Those manual gaps do not decide this result; the automated failures already do.

## Environment

- Node `v26.11.0`
- Playwright `1.63.0` (Chromium from `~/Library/Caches/ms-playwright`, build `chromium-1243`)
- Vitest `3.2.7`
- Postgres `127.0.0.1:54329` via `docker compose` (`topology-postgres`). Colima was started because the Docker daemon was down. The container was already running once Docker was up.
- App env from `.env.local` (not printed). `npm run db:migrate` applied cleanly (journal already present). `npm run db:seed:e2e` ran and skipped the Harbor demo catalog because folders already existed. See SEED-DEMO-001.
- Nothing was listening on `4317` before Playwright. Playwright `webServer` started `npm run dev` on `127.0.0.1:4317` and reused it for later projects. It was down again after the suite exited.
- Docker image builds, Lighthouse, ZAP, and perf benches were not run.

## Harness fixes (assertions unchanged)

The unauthenticated API sweep could not load: Node failed to resolve `next/server` from `next-auth`. `vitest.integration.config.ts` inlines `next-auth`, and the sweep calls handlers with `NextRequest` so `nextUrl` exists. After that, the sweep passed and wrote no `SEC-UNAUTH-*` rows.

Playwright selectors that matched the wrong extra node were narrowed: the login alert ignores the Next.js route announcer, "Automation" and "Pass rate" match exactly, the settings theme group is scoped to `main`, and the member empty state uses the visible table cell. Logged-out smoke and the release gate clear `storageState`, because desktop-1440 injects the admin session and `/login` redirects home. Product behavior was not changed.

## Counts

| Command | Result |
| --- | --- |
| `npm run test:unit` | 96 files passed, 504 tests passed. Exit 0. |
| `npm run test:ui` | 18 files passed, 72 tests passed. Exit 0. |
| `npm run test:integration` | 11 files passed, 1 file skipped (`s3-attachments`, `TOPOLOGY_S3_E2E` unset). 44 tests passed, 1 skipped. Exit 0. |
| `npx playwright test --project=setup --project=desktop-1440` | Setup: 4 passed. desktop-1440 first pass: 32 passed, 25 failed, 3 skipped (60). After the harness fixes, the six selector/session failures were re-run and passed. Net desktop-1440: 38 passed, 19 failed, 3 skipped. |
| `npx playwright test --project=mobile-390 --project=tablet-834 --project=tablet-1194 --project=laptop-1366 --project=desktop-1920` | 114 tests: 71 passed, 43 failed, 0 skipped. Exit 1. Finished in 55.5s. None hung. |

The 3 desktop skips are `test.fixme` (first-run `/setup`, revoked share links, UX-ERR-001). They are not failures.

## Failed specs (product gaps)

Recorded in `tests/ops/FINDINGS.md`:

- A11Y-FOCUS-001 — shortcut cheat sheet Tab trap. desktop-1440 and all five viewports.
- A11Y-CONTRAST-001 — serious color-contrast on hub, plans, runs, automation, triage, reports, settings, and (with the sort bug) cases.
- A11Y-SORT-001 — critical `aria-sort` on cases table sort buttons. Not on mobile-390, where the table is hidden.
- RBAC-VIEW-001 — viewer New case stays enabled.
- SEED-DEMO-001 — Harbor demo catalog was not reseeded. Breaks cases search, hub gate, milestones, Harbor smoke report, and the release gate (`HAR-1`).
- RUN-POINTER-001 — select-all checkbox click is intercepted. Blocks issues, live, runs, and triage.
- RESP-OVERFLOW-001 — `/cases` horizontal overflow at 834 (347px), 1194 (461px), and 1366 (305px).
- UI-HYDRATE-001 — hydration mismatch in the Playwright webServer log. No spec asserts it.

## Not run

VoiceOver, NVDA, OWASP ZAP, backup/restore, Lighthouse, Firefox, WebKit, Docker image builds, and perf benches. S3 attachment round-trip stayed skipped. SEC-HEADERS-001 was not probed with curl after the server shut down.

## Additional runs

Same day. Dev server restarted with `npm run dev` on `http://127.0.0.1:4317` and left up. Postgres stayed `topology-postgres` on `127.0.0.1:54329`. The live `topology` database was not dropped. `PLAYWRIGHT_BROWSERS_PATH` was `$HOME/Library/Caches/ms-playwright`.

| Command | Result |
| --- | --- |
| `TOPOLOGY_OPS_E2E=1 npx tsx --env-file=.env.local --test tests/ops/migrate-idempotent.ts` | Pass. `runMigrations` twice, exit 0. `drizzle.__drizzle_migrations` stayed at 4 rows. The "schema already exists" notices are `CREATE SCHEMA` / `CREATE TABLE` `IF NOT EXISTS`, not new journal entries. |
| Lighthouse 13.6.0, desktop preset, signed-in Chrome, against `next dev` | `/` Performance 93, Best Practices 100, Accessibility 100. `/cases` 60 / 100 / 89. `/runs/72ff96c1-8f0b-4e41-93dc-c8730a666573` 93 / 100 / 95. Home meets the budget. Cases misses Performance and Accessibility. The run page misses Accessibility. |
| `npx playwright install firefox webkit` | Pass. Firefox 155 (`firefox-1543`) and WebKit 26.6 (`webkit-2359`). |
| `npx playwright test --browser=firefox` and `--browser=webkit` | Fail immediately. Playwright 1.63: "Cannot use --browser option when configuration file defines projects." |
| One-off desktop project, Firefox, then deleted | Launch failed. `firefox-1543` exits with "Could not find profile folder" for a single worker and for a hand-made profile. Parallel file set: 6 passed, 31 failed, 3 skipped. Workers 1, `--no-deps`: 2 passed, 31 failed, 3 skipped. Failures are the launch error. The skips are the three `test.fixme` specs. No Firefox page assertion completed. |
| One-off desktop project, WebKit, workers 2, `--no-deps`, same file set, config deleted after | 20 passed, 13 failed, 3 skipped (`test.fixme`). Exit 1. About 3.2 minutes. |
| Reporter unit tests | Pass. Playwright, Jest, and Cypress map tests: 13 passed. `pytest` `test_report.py`: 3 passed. |
| In-process `POST /api/executions` for one mapped payload each | Pass. 4 passed (Playwright, Jest, Cypress, pytest). Temporary test file removed. |
| MinIO | Skipped. `docker pull minio/minio` was denied (repository missing or private). `quay.io/minio/minio` returned 401. `s3-attachments` was not run. |
| `docker build -t topology:release-ops -f Dockerfile .` | Fail. `next build` typecheck: `TS5097` in `tests/ops/migrate-idempotent.ts`. See OPS-IMAGE-001. |
| `docker compose -f docker-compose.prod.yml up` | Skipped. The compose file publishes `${PORT:-4317}:4317`, which is the dev app. The dev app was not stopped. |
| Backup / restore | Pass on a throwaway database. See below. Prod compose was not used. |
| `npm run db:perf-fixture` / `db:perf-bench` | Skipped. Both use `DATABASE_URL` and the `topology` database. The fixture only deletes the `perf-fixture` workspace, but it is not a separate database or schema. |

Lighthouse was desktop (`--preset=desktop`), categories performance, best-practices, and accessibility, with storage reset disabled and a session cookie for the demo user. It measured `next dev`, not a production build. `/cases` Accessibility 89 is A11Y-SORT-001 plus A11Y-NAME-001 (`button-name` on leaf folder buttons). The run page Accessibility 95 is A11Y-SELECT-001 and A11Y-LABEL-001. Cases Performance 60 is total blocking time about 1.8s on the dev server. That miss is not filed as a production budget defect.

WebKit failures, and the known defect they repeat:

- SEED-DEMO-001 again: cases search never shows "Shopper can open the storefront home"; milestones never show "Harbor 2.4 checkout gate"; reports never show a Harbor smoke link.
- RBAC-VIEW-001 again: viewer New case is enabled.
- RUN-POINTER-001 again: issues, live, triage, and runs time out clicking "Select all visible cases". `span.checkbox__control` and the column header intercept the pointer.
- Hub, release gate, and logged-out smoke: `getByText("Operating hub")` is not a single visible node. On the hub page WebKit found two paragraphs, one hidden (UI-HYDRATE-001). The fresh login flows stayed on `/login` and showed the invalid-credentials alert, so they never reached the hub.
- Settings: `getByRole('heading', { name: 'Roles' })` also matched the "Custom roles" heading. Not filed as a new product defect.
- Empty cases search did not show "No cases match this search or folder." Chromium had not failed this spec. Recorded as a WebKit note, not a new id.

Color-contrast was not executed again. A11Y-CONTRAST-001 stays as previously recorded. The three `test.fixme` specs stayed skipped. VoiceOver, NVDA, and ZAP were not run.

Backup used the dev Postgres container, not `docker-compose.prod.yml`. `pg_dump -Fc` of `topology` was 666357 bytes. `pg_restore --clean --if-exists` into new database `topology_ops_restore` matched the live database: 2192 cases, 5 users, 4 journal rows. Two migrates against that database left the journal at 4 rows. The throwaway database and the dump file were dropped. Live `topology` was still 2192 cases and 4 journal rows afterward. Attachment blobs were not copied. The prod volume was not mounted.
