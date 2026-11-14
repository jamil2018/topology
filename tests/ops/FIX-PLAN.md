# Fix plan

No-go. The previously failing P0 defects were not cleared. WebKit reproduced SEED-DEMO-001, RBAC-VIEW-001, and RUN-POINTER-001. Lighthouse Accessibility was under 100 on `/cases` and the run page. The production image did not build. Do not weaken tests. Leave the three `test.fixme` specs as fixme.

Retest the Chromium release gate with:

```bash
npx playwright test --project=setup --project=desktop-1440
```

## P0

### SEED-DEMO-001

`npm run db:seed:e2e` skips the Harbor catalog when any folder row exists. The release gate cannot find `HAR-1`. Cases search cannot find "Shopper can open the storefront home". The hub and milestones pages do not show "Harbor 2.4 checkout gate". The reports spec cannot find the Harbor smoke link. That reports failure is this same defect, not a second bug.

Change `seedDemoWorkspace` in `src/db/seed-demo.ts`. The early return after `folders` is non-empty (about line 659) skips case insert and only adds the Harbor milestone when the milestones table is empty. `src/db/seed.ts` logs "Folders present — seeded quality graph" for that path.

Retest: seed again on a database that already has folders, then confirm the Harbor case, milestone, and smoke report exist. Run `e2e/release-gate.spec.ts`, `e2e/functional/cases.spec.ts`, `e2e/functional/hub.spec.ts`, `e2e/functional/milestones.spec.ts`, and `e2e/functional/reports.spec.ts`.

### RBAC-VIEW-001

The viewer New case button stays enabled. `POST /api/cases` already returns 403. The UI never consults `cases.create`.

Change the New case `Button` in `src/components/cases-workspace.tsx` (the primary action in `PageHeader`). Pass a permission flag from `src/app/(app)/cases/page.tsx`. `legacyRoleHasAction` in `src/lib/permissions.ts` already denies viewers `cases.create`. The API check is in `src/app/api/cases/route.ts`.

Retest: `e2e/rbac/roles.spec.ts` "viewer loads test cases without a usable create control", including the follow-up 403.

### A11Y-CONTRAST-001

Muted text is `#71717a` on `#f4f4f5` (about 4.39:1). Axe reports serious `color-contrast` on hub, plans, runs, automation, triage, reports, settings, and cases. This run did not re-execute axe. Lighthouse on the dev server did not list `color-contrast`. The defect stays.

Change `--topo-muted` and the surfaces it sits on in `src/app/globals.css` (`--topo-paper` is `#f4f4f5`).

Retest: `e2e/a11y/routes.spec.ts` on desktop-1440 and the viewport projects. Do not disable the contrast rule.

### A11Y-SORT-001

Case column sort buttons set `aria-sort` on the `<button>`. That attribute is only valid on the column header. Lighthouse `aria-allowed-attr` on `/cases` is this same defect.

Move `aria-sort` from the button to the `<th>` in `src/components/cases-table.tsx`.

Retest: the cases page test in `e2e/a11y/routes.spec.ts`. Mobile-390 hides the table, so use a width where `sm:table` is shown.

### A11Y-FOCUS-001

The shortcut cheat sheet does not trap Tab. The dialog in `src/components/shortcut-layer.tsx` sets `role="dialog"` and `aria-modal="true"` and does not handle Tab or Shift+Tab.

Trap focus inside that dialog and restore it on Escape.

Retest: `e2e/a11y/keyboard.spec.ts` "shortcut cheat sheet traps focus and closes on escape", on desktop-1440 and the viewport projects.

### RUN-POINTER-001

The run picker select-all checkbox cannot be clicked. WebKit reproduced it. The input is visible and checked. `span.checkbox__control` and the column header `<th>` intercept pointer events.

Change the select-all `Checkbox` in `src/components/run-case-picker-table.tsx` (the header cell around the "Select all visible cases" control).

Retest: `e2e/functional/issues.spec.ts`, `live.spec.ts`, `runs.spec.ts`, and `triage.spec.ts`. They all enter through `startManualRun` in `e2e/functional/run-flow.ts`.

### RESP-OVERFLOW-001

`/cases` scrolls sideways: 347px at 834, 461px at 1194, and 305px at 1366. The table is `w-full` inside `overflow-hidden` without `min-w-0`, so the grid item keeps the table's min-content width. Below `lg`, `src/components/cases-workspace.tsx` uses a single column. At `lg` the tracks are `15rem` plus `minmax(0,1fr)`.

Constrain the table scroller in `src/components/cases-table.tsx` and the grid child in `src/components/cases-workspace.tsx`. `main` in `src/components/hub-shell.tsx` is `overflow-y-auto` only.

Retest: `e2e/responsive/overflow.spec.ts` on `tablet-834`, `tablet-1194`, and `laptop-1366`.

### UI-HYDRATE-001

The dev server logged a hydration mismatch on authenticated pages. `src/components/theme-provider.tsx` calls `bootstrapClient()` at import and `useSyncExternalStore` returns the `localStorage` preference on the client while `getServerSnapshot` returns `"system"`. `src/components/theme-toggle.tsx` sets `aria-pressed` from that value. `src/app/layout.tsx` also writes `class` and `data-theme` from a boot script. `html` has `suppressHydrationWarning`. The toggle does not.

WebKit also found two "Operating hub" paragraphs, one hidden, so `getByText("Operating hub")` fails strict mode in `e2e/functional/hub.spec.ts`, `e2e/auth.setup.ts`, and the login specs.

Make the first client render match the server snapshot, then apply the stored theme after hydration.

Retest: load `/` and `/cases` in `next dev` and confirm the console has no hydration error. Re-run the hub spec and auth setup.

## P1

### OPS-IMAGE-001

`docker build -f Dockerfile .` fails in `npm run build`. Next typechecks `tests/ops/migrate-idempotent.ts` because `tsconfig.json` includes `**/*.ts` and only excludes `**/*.test.ts` and `e2e`. The ops file imports `../../src/db/migrator.ts`, which is `TS5097`. `.dockerignore` does not exclude `tests/`.

Exclude `tests/ops` from the app typecheck, or drop the `.ts` suffix on that dynamic import. Do not skip typecheck in the image to hide it.

Retest: `docker build -t topology:release-ops -f Dockerfile .`

### SEC-HEADERS-001

Responses do not send Content-Security-Policy, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, or HSTS. `next.config.ts` has no `headers()`. `src/middleware.ts` only handles auth. Next 16 deprecates `middleware.ts` in favor of `proxy.ts`. The behavior is unchanged until that rename. Putting headers in `next.config.ts` `headers()` does not depend on the rename.

Retest: `curl -sI` against `/login` and `/api/health` on the running app.

### WH-001

An empty webhook secret omits `X-Topology-Signature`. `signBody` in `src/lib/webhooks.ts` returns null when the secret is empty, and `deliverToEndpoint` only sets the header when a signature exists. `src/app/api/webhooks/route.ts` defaults `secret` to `""`.

Require a secret on create, or refuse to deliver when it is empty.

Retest: `src/lib/webhooks.test.ts` and `tests/integration/webhooks.integration.test.ts`.

### WH-002

A failed delivery is one `fetch` in `deliverToEndpoint` (`src/lib/webhooks.ts`). Non-2xx and thrown errors store `lastStatus` and return. There is no retry or backoff.

Retest: the webhook integration test with a receiver that fails once and then succeeds.

### A11Y-SKIP-001

There is no skip link on `/login` or the signed-in shell. `e2e/a11y/keyboard.spec.ts` records the gap and does not fail.

Add a skip link in `src/app/layout.tsx` or `src/components/hub-shell.tsx`, and on `src/app/login/page.tsx`, pointing at `main`.

Retest: the skip-link helper in `e2e/a11y/keyboard.spec.ts`. It should start failing the suite if the link is missing after the annotation is turned into an assertion. Until then, confirm the link is present and moves focus.

### A11Y-NAME-001

Leaf folder rows in `src/components/folder-tree-pane.tsx` render a disabled button with no accessible name when the folder has no children. Lighthouse `button-name` scored 0 on `/cases` (14 nodes).

Give those controls a name, or do not use a `<button>` for the spacer.

Retest: Lighthouse accessibility on `/cases`, and axe on that page.

### A11Y-SELECT-001

The run assignee `<select>` in `src/components/run-executor.tsx` has a sibling span "Run assignee" and no label association. Lighthouse `select-name` scored 0 on the run page.

Associate the visible text with the select.

Retest: Lighthouse accessibility on a real `/runs/<id>`.

### A11Y-LABEL-001

Status chips in `src/components/run-case-list.tsx` set `aria-label` to the status word while the visible button also includes a count. Lighthouse `label-content-name-mismatch` scored 0 on the run page.

Make the accessible name include the visible text, or drop the redundant `aria-label` when the text is already the name.

Retest: Lighthouse accessibility on a real run URL.

### Harbor smoke report

`e2e/functional/reports.spec.ts` still cannot find `/Harbor smoke/`. That is SEED-DEMO-001. Do not file a second defect. Retest that spec after the seed fix.

## P2

### Coverage still to write

These have no specs. They were not executed and are not failures:

- Optimistic rollback
- Skeletons
- Toasts
- Offline and slow network
- SSE reconnect
- Dialog fit
- Table scroll
- Tablet orientation
- Screenshot baselines (`toHaveScreenshot` at desktop-1440, both themes)

`e2e/ux/GAPS.md` already notes the cases error boundary (`UX-ERR-001`, still `test.fixme`).

### Firefox and WebKit

Playwright 1.63 rejects `--browser` because `playwright.config.ts` defines projects. Firefox 155 installed and then failed to launch (`Could not find profile folder`), including a one-worker rerun. No Firefox page test completed. WebKit 26.6 ran the desktop file set: 20 passed, 13 failed, 3 `test.fixme` skipped. The product failures above reproduced. Fresh WebKit login stayed on `/login` with the invalid-credentials alert. The settings spec also matched both the "Roles" and "Custom roles" headings. The empty-search spec did not find its copy. Those last two are WebKit notes, not new defect ids.

After OPS-IMAGE and the P0 fixes, add real `firefox` and `webkit` projects that depend on `setup` and use the admin storage state, instead of `--browser`. Firefox needs a build that launches on this OS before it can be a result.

### S3

Skipped. Docker Hub denied `minio/minio`. Quay returned 401 for `quay.io/minio/minio`. `tests/integration/s3-attachments.integration.test.ts` was not run. Retry when an image can be pulled, with `TOPOLOGY_S3_E2E=1` and the env in `tests/ops/README.md`. Tear the extra container down afterward. Do not change committed compose unless a commented MinIO example is added on purpose.

### Docker and backup

The image build failed (OPS-IMAGE-001), so `/api/health` and `id -u` were not checked on a running container. `Dockerfile` ends with `USER node`. `docker-compose.prod.yml` publishes port 4317, which the dev app was using, so the prod stack was not booted.

Backup against the dev Postgres container succeeded for database `topology_ops_restore` (dump 666357 bytes, 2192 cases, 5 users, 4 journal rows, second migrate left the journal at 4). The throwaway database was dropped. The documented `docker compose -f docker-compose.prod.yml exec postgres` path and the attachments volume were not exercised. Repeat OPS-BAK-001 on a prod stack once the image builds and the host port does not collide with the dev app.

### Lighthouse and performance

Desktop Lighthouse 13.6.0 against `next dev`, signed in:

| URL | Performance | Best Practices | Accessibility |
| --- | --- | --- | --- |
| `/` | 93 | 100 | 100 |
| `/cases` | 60 | 100 | 89 |
| `/runs/72ff96c1-8f0b-4e41-93dc-c8730a666573` | 93 | 100 | 95 |

Budget is Performance and Best Practices at least 90, Accessibility 100. Re-measure on a production build after the contrast, sort, name, select, and label fixes. Cases Performance 60 (blocking time about 1.8s) is a dev-server sample, not a filed production defect.

`npm run db:perf-fixture` and `npm run db:perf-bench` were not run. `scripts/perf-fixture.ts` uses `DATABASE_URL` and deletes only the `perf-fixture` workspace inside database `topology`. That is not a separate database or schema. Point them at another database before running the 5,000-case default or the 50,000-case budget.

### Reporter upload

Executed and passed. Package unit tests: 13 Vitest tests plus 3 pytest tests. One mapped execution report for each of Playwright, Jest, Cypress, and pytest was posted in process to `POST /api/executions`, the same style as `tests/integration/cli-ingest.integration.test.ts`. No product change came out of that smoke.

## Go / no-go

No-go. None of the previously failing P0 defects passed in this run. WebKit still misses the Harbor seed, still leaves New case enabled for a viewer, and still cannot click select-all. Accessibility budgets failed on `/cases` and the run page. The production image does not build.
