# Ops and integration findings

Recorded while adding integration coverage. These tests document current behavior and do not fail the default suite.

## WH-001 Empty webhook secret omits the HMAC signature

- Severity: Medium
- Expected: Outbound deliveries include an HMAC signature (`X-Topology-Signature: sha256=...`).
- Actual: `signBody` returns null when the secret is empty, and `deliverToEndpoint` omits the header. Endpoint create defaults `secret` to `""`, so a saved endpoint with no secret is delivered unsigned.

## WH-002 Failed webhook deliveries are not retried

- Severity: Low
- Expected: A failed delivery is retried (release plan, integrations section).
- Actual: `deliverToEndpoint` performs one `fetch`. A non-2xx response or a thrown error stores `lastStatus` and returns. There is no retry loop or backoff.

SSRF blocking for loopback, link-local, and private webhook targets is implemented (`webhookUrlError`, `assertSafeWebhookDestination`) and covered by `src/lib/webhooks.test.ts` plus `tests/integration/webhooks.integration.test.ts`. No defect recorded for that control.

## SEC-HEADERS-001 Response security headers are not set

- Severity: Medium
- Expected: Responses send Content-Security-Policy (including `frame-ancestors`), `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, and HSTS when the app is served over TLS.
- Actual: `next.config.ts` exports no `headers()` function, so none of those headers are set. `src/middleware.ts` is the auth middleware (NextAuth `authorized`). It gates pages and APIs and does not set the headers either.
- Next 16 note: `next@16.3.5` documents `middleware.ts` as deprecated and renamed to `proxy.ts` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/middleware.md` and `proxy.md`). The docs say the behavior is unchanged and the old filename still runs until it is migrated (`npx @next/codemod@canary middleware-to-proxy`). This app still ships `src/middleware.ts` and has no `src/proxy.ts`. Putting the headers in `next.config.ts` `headers()` would be a product change and is not done here.

## Release run 2026-11-06

`test.fixme` cases are known gaps and were not counted as failures:

- First-run `/setup` (`e2e/functional/auth.spec.ts`) — admin creation cannot run while any user exists.
- Revoked share links (`e2e/functional/reports.spec.ts`) — no revoke control or API for `/share/reports/[token]`.
- Cases route error boundary, UX-ERR-001 (`e2e/ux/errors.spec.ts`) — failed cases GET does not show the route error boundary.

`tests/integration/s3-attachments.integration.test.ts` skipped because `TOPOLOGY_S3_E2E` was unset. SEC-HEADERS-001 was not re-checked over HTTP in this run; no Playwright spec asserts those headers.

## A11Y-FOCUS-001 Shortcut cheat sheet does not trap Tab

- Severity: High
- Kind: Product gap
- Spec: `e2e/a11y/keyboard.spec.ts` — "shortcut cheat sheet traps focus and closes on escape"
- Assertion: After Shift+/, Tab and Shift+Tab stay inside the "Keyboard shortcuts" dialog (`focusedInsideDialog` is true).
- Actual: `Tab left the Keyboard shortcuts dialog` (expected true, received false). Reproduced on desktop-1440 and on mobile-390, tablet-834, tablet-1194, laptop-1366, and desktop-1920.

## A11Y-CONTRAST-001 Text contrast is below 4.5:1

- Severity: High
- Kind: Product gap
- Spec: `e2e/a11y/routes.spec.ts` — "has no serious axe violations" for hub, plans, runs, automation, triage, reports, and settings. The cases page also reports this alongside A11Y-SORT-001.
- Assertion: `expectNoSeriousOrCriticalViolations` — axe violations with impact serious or critical equal `[]`.
- Actual: Serious `color-contrast`. On the light hub, muted text is `#71717a` on `#f4f4f5` (ratio 4.39; 10px and 14px text need 4.5:1). The same token fails on nav labels, chips, and settings links across the viewports above. Login axe on desktop-1440 passed.

## A11Y-SORT-001 Case column sort buttons use aria-sort

- Severity: High
- Kind: Product gap
- Spec: `e2e/a11y/routes.spec.ts` — "cases page has no serious axe violations" (desktop-1440, tablet-834, laptop-1366, desktop-1920). Mobile-390 hides the table, so this rule did not fail there.
- Assertion: No serious or critical axe violations.
- Actual: Critical `aria-allowed-attr` on `button[aria-sort]`. `src/components/cases-table.tsx` sets `aria-sort` on the sort `<button>` inside `<th>`. That attribute is only valid on the column header itself.

## RBAC-VIEW-001 Viewer New case button stays enabled

- Severity: High
- Kind: Product gap
- Spec: `e2e/rbac/roles.spec.ts` — "viewer loads test cases without a usable create control"
- Assertion: `getByRole('button', { name: 'New case' })` is disabled when the button is rendered (`expectCreateCaseBlocked`).
- Actual: The button is enabled. The test stops there, so this run did not reach the follow-up `POST /api/cases` 403 assertion.

## SEED-DEMO-001 Demo seed skips the Harbor catalog when folders exist

- Severity: Blocker
- Kind: Product gap
- Specs:
  - `e2e/functional/cases.spec.ts` — search for "Shopper can open the storefront home" shows "0 matches" / "No cases match this search or folder."
  - `e2e/functional/hub.spec.ts` — Overview milestone link "Harbor 2.4 checkout gate" is absent. The gate shown is "mass-probe".
  - `e2e/functional/milestones.spec.ts` — heading "Milestones" is visible; heading "Harbor 2.4 checkout gate" is not. The list is bughunt and probe milestones.
  - `e2e/functional/reports.spec.ts` — exact "Pass rate" is visible; link `/Harbor smoke/` is not.
  - `e2e/release-gate.spec.ts` — after login, search for `HAR-1` finds no such text.
- Assertion: The seeded Harbor checkout case, milestone gate, smoke report, and `HAR-1` are on screen.
- Actual: `npm run db:seed:e2e` logged "Folders present — seeded quality graph" and skipped the demo catalog. `seedDemoWorkspace` returns `skipped: true` when any folder row exists, and it inserts "Harbor 2.4 checkout gate" only when the milestones table is empty. This database already had folders and eight other milestones. A SQL check after the run found no case titled "Shopper can open the storefront home" and no milestone named "Harbor 2.4 checkout gate".

## RUN-POINTER-001 Select-all checkbox cannot be clicked

- Severity: High
- Kind: Product gap
- Specs (all time out in `e2e/functional/run-flow.ts` `startManualRun` on `getByRole('checkbox', { name: 'Select all visible cases' }).click()`):
  - `e2e/functional/issues.spec.ts`
  - `e2e/functional/live.spec.ts`
  - `e2e/functional/runs.spec.ts`
  - `e2e/functional/triage.spec.ts`
- Assertion: The checked "Select all visible cases" checkbox can be clicked, then the picker shows "0 selected".
- Actual: The input is visible and checked, but the click never lands. `span.checkbox__control` (and sometimes the column header `<th>`) intercepts pointer events. HeroUI renders that control in `src/components/run-case-picker-table.tsx`. These specs never reach result recording.

## RESP-OVERFLOW-001 Cases page scrolls sideways at tablet and laptop widths

- Severity: Medium
- Kind: Product gap
- Spec: `e2e/responsive/overflow.spec.ts` — "/cases has no horizontal overflow"
- Assertion: `documentElement.scrollWidth - clientWidth <= 1`.
- Actual: tablet-834 overflowed by 347px, tablet-1194 by 461px, laptop-1366 by 305px. The same check passed for `/cases` on mobile-390 and desktop-1920, and for `/`, `/runs`, `/reports`, and `/settings` on the widths that ran them.

## UI-HYDRATE-001 Server HTML does not match the client

- Severity: Medium
- Kind: Product gap
- Spec: No assertion failed on this alone. The Playwright webServer logged `Uncaught Error: Hydration failed because the server rendered HTML didn't match the client` during desktop-1440 and the viewport projects.
- Assertion: Not asserted by a spec.
- Actual: Next.js recovered by regenerating the tree on the client. The mismatch showed up while authenticated pages were rendering.
- Additional run, 2026-11-06 WebKit: `e2e/functional/hub.spec.ts` saw two `<p>` nodes with the text "Operating hub" and the page-header classes. One is the visible eyebrow in `main` (`src/components/hub-pulse.tsx` via `src/components/page-header.tsx`). The other stayed hidden, so `getByText("Operating hub")` is not unique. `src/components/theme-provider.tsx` still reads `localStorage` in `getSnapshot` while `getServerSnapshot` returns `"system"`, and `src/components/theme-toggle.tsx` renders `aria-pressed` from that snapshot.

## A11Y-NAME-001 Folder rows expose unnamed buttons

- Severity: Medium
- Kind: Product gap
- Spec: No Playwright assertion. Lighthouse `button-name` on `/cases` during the 2026-11-06 desktop run (14 nodes, score 0).
- Expected: Every button has an accessible name.
- Actual: Leaf folders render a disabled `<button>` with no `aria-label` in `src/components/folder-tree-pane.tsx`. The control is a transparent spacer when the folder has no children.

## A11Y-SELECT-001 Run assignee select has no accessible name

- Severity: Medium
- Kind: Product gap
- Spec: No Playwright assertion. Lighthouse `select-name` on `/runs/72ff96c1-8f0b-4e41-93dc-c8730a666573` (1 node, score 0).
- Expected: The assignee `<select>` has a programmatic label.
- Actual: `src/components/run-executor.tsx` places the words "Run assignee" in a sibling `<span>`. That span is not a `<label>` and is not tied to the select with `aria-label` or `aria-labelledby`.

## A11Y-LABEL-001 Run filter chips disagree with their visible text

- Severity: Medium
- Kind: Product gap
- Spec: No Playwright assertion. Lighthouse `label-content-name-mismatch` on the same run URL (7 nodes, score 0).
- Expected: The accessible name contains the visible text.
- Actual: `src/components/run-case-list.tsx` sets `aria-label` to the status word (`Untested`, `Failed`, `Blocked`, and the other chips) while the button also shows a count.

## OPS-IMAGE-001 Production image build fails typecheck

- Severity: High
- Kind: Ops gap
- Spec: `docker build -t topology:release-ops -f Dockerfile .` on 2026-11-06. `npm run build` inside the image exits 1.
- Expected: `next build` completes and the image can boot.
- Actual: TypeScript reports `tests/ops/migrate-idempotent.ts(26,44): error TS5097`. That file imports `../../src/db/migrator.ts`. `tsconfig.json` includes `**/*.ts` and does not exclude `tests/ops`, and `.dockerignore` does not drop `tests/`. The image was not produced, so the non-root user and `/api/health` were not checked on a running container. `Dockerfile` still ends with `USER node`.
