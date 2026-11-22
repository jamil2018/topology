# UI simplification review — 2026-11-14

## Status (read first)

| Status | Meaning |
| --- | --- |
| **Historical UX review** | Records the 2026-11-14 simplification pass, bugs found during verification, and reviewer ratings. |
| **Landed in product** | Home/Overview naming, simplified case/run creation, execution filters, settings disclosures, and the full-width case-details workspace described below shipped into the current app. |
| **Resolved in-pass** | Global Enter shortcut swallowing native activation, repositories webhook URL hydration mismatch, run-status `ILIKE` enum crash, loading-role names, and Home theme animation contrast issues were fixed during this review. |
| **Not a live scoreboard** | Pass counts, Lighthouse, and heuristic 9/10 ratings below are scoped historical evidence, not current CI or WCAG certification. |

---

This pass reduces the concepts users must remember while creating cases, preparing runs, recording results, filtering work, and finding settings. It builds on the existing uncommitted refinement work; it does not replace that work or claim its verification as new evidence.

## Changes and rationale

- Use **Home** consistently in navigation, the palette, page title, and error state. **My work** and **Overview** distinguish daily tasks from aggregate information. Remove routine health badges and CI setup from the daily-work header.
- Lead case creation with title and steps. Keep the suggested key, description, priority, status, folder, and tags under **Case details**, with a visible summary and Draft-to-Ready guidance. Fields retain their values when collapsed.
- Lead run creation with name and case selection. Put environment, assignee, and notes under **Run options**; put extra picker controls under **Filter and sort cases**. Show why creation is unavailable, retain input after errors, and retain the completed form until navigation succeeds.
- Show how many selected cases are outside filters. **Clear filters** preserves selection; **Reset to all ready** remains a distinct selection-changing operation.
- Use readable statuses and passed/failed counts. Remove internal run-ID fragments from everyday lists and Home. Move Abort under **More actions**, retaining its confirmation and authorization checks.
- Give execution an explicit **All** status filter and a no-match **Clear filters** action. Distinguish a filtered empty run list from a project with no runs.
- Turn integrations into five labeled disclosures. Preserve direct, legacy, same-page, and history anchor navigation. Wrap Settings navigation at narrow widths so every section remains discoverable.
- Add persistent plan labels, disabled-action guidance, error announcements, an accessible triage issue-key name, and report-filter recovery. Hide healthy live-connection messages while retaining reconnection warnings.

No domain entities, permissions, historical records, or integration features were removed. No new runtime dependency or migration was introduced.

## Bugs found during verification

- The global Enter shortcut swallowed native activation of buttons, links, and disclosure summaries. It now leaves Enter to those controls; list activation still works elsewhere. A unit regression and real keyboard test cover this.
- The repositories panel generated different webhook URLs on the server and client. It now uses the server-provided application URL, removing the hydration mismatch.
- Run search applied `ILIKE` directly to a PostgreSQL enum and crashed. Casting the status to text preserves parameterized search and workspace scope. Browser checks cover matching status search, no-match search, and recovery.
- Route-loading placeholders now use a status role so their accessible names are valid.
- The Home switcher no longer animates foreground color across theme changes. Contrast scans wait for saved-theme hydration and finite CSS transitions before assessing settled screens.

## Independent review

An independent reviewer inspected the session delta against a snapshot of the starting working tree, reviewed screenshots, and performed three UX review rounds plus a focused review of the enum-cast fix. Required findings were addressed between rounds. The reviewer found no remaining required changes in the reviewed delta.

The rubric uses 9 to mean no significant observed friction in the reviewed workflows, not perfection or measured user satisfaction. The final rebuilt application passed the scoped browser checks. The review ratings are:

| Dimension | Reviewer rating |
| --- | ---: |
| Learnability | 9/10 |
| Memory burden | 9/10 |
| Navigation | 9/10 |
| Consistency | 9/10 |
| Feedback | 9/10 |
| Error recovery | 9/10 |
| Accessibility within the tested scope | 9/10 |
| Task efficiency | 9/10 |

## Verification

Tests run against a new disposable PostgreSQL fixture on port 54349. The existing development database was not seeded or migrated by this pass. Local browser testing uses port 4320.

- Unit: 505 passed.
- UI: 83 passed.
- TypeScript: passed.
- ESLint: no errors; 38 existing warnings remain.
- Production webpack build: passed on the final source; served with the standalone server.
- Final browser coverage: all 18 distinct checks passed across Chromium and WebKit on the same final application build. The 14 core checks passed in the full verification run; four secondary checks passed in an isolated rerun after correcting the searchbox locator. Earlier failed attempts remain recorded.
- After the final loading-role and Home-class changes, the seven relevant UI tests passed again.
- Browser acceptance: `e2e/simplification.spec.ts`, configured by `playwright.ux.config.ts`.

The browser suite checks retained optional case data, run options validation, failed submission/retry, result recording, abort confirmation/cancel, keyboard disclosures, direct/legacy/hash-history integration links, hidden selections, search recovery, and 320/768/1440px core reflow. It also scans runs, plans, reports, triage, automation, and execution in both themes. Accessibility assertions reject serious/critical axe findings within `main`; execution is checked at 320px and 1440px. Screenshot and console/page-error checks support these assertions.

Evidence lives in `test-results/ux-simplification/`, with failed iterations retained separately. Final core traces are under `verified/`; the successful four-check rerun is under `verified-secondary-final/`. Check logs are under `checks/`. Early failures included the real keyboard, hydration, and enum bugs, plus corrected test locators, navigation timing, and theme-settling assumptions. Failed iterations are not counted as passes.

To reproduce against a running, seeded disposable instance with a valid demo login storage state:

```sh
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4320 \
UX_STORAGE_STATE=/path/to/test-auth.json \
npx playwright test --config=playwright.ux.config.ts
```

The default storage path is the repository's existing `e2e/.auth/admin.json`. Do not run mutation tests against a working or production database.

## Limits

The scores are scoped heuristic review, supported by browser evidence, not a product-wide usability measurement or WCAG certification. Real-user task completion, screen-reader interoperability, the complete permissions matrix, optional quality-graph authoring, imports, and actual external integration execution have not been qualified here. Reports/plans/triage receive source review and visual/accessibility scans, with less end-to-end depth than the central testing workflow.

The workspace already contained substantial unrelated uncommitted changes. They were preserved; this pass was not published, merged, or committed together with them.

## User evaluation follow-up: case details and navigation

User evaluation found that the three-column case editor remained too narrow even after its grid placement was corrected. The prior heuristic scores did not capture this review workflow adequately.

Opening a case now makes details the main workspace. Folders and test cases remain mounted behind compact rail controls; hover, focus, or click reveals the corresponding popup. Closing details restores the full folder/list layout and keyboard focus. Folder selection opens the filtered case picker directly, including on mobile. Case switching and closing retain unsaved-change confirmation; choosing the current case preserves its draft. Step fields use the available width. Notifications use the standard top-right icon close control.

Independent review identified and resolved stale hover-close timers, focus restoration, nested mobile folder navigation, and focus transfer from folder selection to case search. The reviewer approved the final source and desktop/mobile screenshots.

Validation for this follow-up: production build passed; 83 UI tests passed; changed-component lint had no errors (six existing hook-dependency warnings). Six targeted acceptance checks passed together in Chromium/WebKit, covering responsive details at 320–1600px, hover/focus/click menus, switching, dirty close/keep/discard, rapid menu transitions, mobile folder selection, and notification dismissal. Evidence: `test-results/ux-simplification/focus-final/`. Earlier interrupted verification overlapped a build and is not counted as passing evidence. These changes remain local for further user evaluation.
