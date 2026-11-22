# QA productivity and UI refinement

## Status (read first)

| Status | Meaning |
| --- | --- |
| **Historical refinement record** | Documents the productivity/UI refinement pass and its verification counts at the time. |
| **Landed in product** | Run templates, retests with lineage, team saved views, notifications open redirect, paginated cases/runs, and related APIs described below shipped; see later migrations `0004_productivity` / `0005_retest_case_links` and current app code. |
| **Superseded follow-ups** | Case-inspector layout and Home naming were further simplified in [ux-simplification.md](ux-simplification.md). Middleware→proxy migration and broader release gates continued after this record. |
| **Not a live scoreboard** | Unit/UI/Lighthouse numbers and open qualification notes below are historical evidence, not current CI status. |

---

## Scope and compatibility

The refinement preserves Geist, Phosphor, HeroUI, and the zinc/teal palette. Project capabilities come from the existing server membership model; API checks remain authoritative. Existing saved views default to private, and existing list/API shapes remain supported.

The run-template model is separate from matrix plans. Launch reviews current cases and assignees before creating fresh untested results. Missing references require correction. Retests deduplicate cases and record source-result lineage transactionally. Mapping an unmapped automation failure creates a separate association; it does not alter the historical result or resolve triage. Assignment notifications are emitted only when another user's assignment changes and open with project context.

## Review increments

1. Reliability: typecheck repair, permission context, mutation locks/rollback, load errors/retry, reconnect refresh, focus containment and accessible labels.
2. Shared UI: readable typography, contrast tokens, page headers, form/feedback patterns, persistent sidebar state, work-first home, reduced decorative animation.
3. Cases/runs: API pagination, URL history, retained cross-page selection, local table scrolling, responsive inspector/folders, run context persistence, reviewable selection.
4. Secondary screens: consistent mutation feedback/capabilities for plans, releases, milestones and graph authoring; stable dates and accessible chart values.
5. Productivity: team views, templates, reviewed retests, immutable case links, notifications.
6. Qualification: UI/unit/integration/migration checks, real browsers, screen-family screenshots, production build and Lighthouse.

## Additive interfaces

| Interface | Contract |
| --- | --- |
| `GET/POST /api/run-templates` | Project-member reads; `runs.create` creates an ordered case selection with environment and optional assignee |
| `GET/PATCH/DELETE /api/run-templates/:id` | Read in project scope; creator with `runs.create` or project administrator can modify |
| `GET/POST /api/runs/retest` | Review eligible/excluded source results; transaction creates fresh results and source lineage |
| `GET /api/runs/:id/retests` | Source failures and subsequent outcomes |
| `POST /api/results/:id/case` | Separate project-scoped mapping for an unmapped result; historical result is unchanged |
| `GET /api/notifications/:id/open` | Validate recipient/project/target, set project context, then redirect |
| Existing views API | Additive `visibility` plus status/assignee/environment/kind run filters |
| Existing cases POST | Optional `structuredSteps`, committed atomically with the new case |

Cases and runs use paginated APIs. Cases retain explicit selected IDs across pages and fetch an out-of-page deep link separately. Inspector selection uses `?case=...` without remounting; existing `/cases/:key` deep links still work. Run result/filter context is URL-backed and stored per user/project/run, with explicit links taking precedence. The run-creation picker still loads the full selectable catalog; normal list pages do not.

## Database upgrade

`0004_productivity` adds saved-view visibility, templates, and retest lineage. `0005_retest_case_links` adds immutable result-to-case mappings and preserves unavailable template assignee IDs so launch cannot silently unassign them. No existing case/result data is rewritten. The unstamped-schema reconciliation path includes these additions.

Before deployment, back up the database and apply `npm run db:migrate`. Reapplying must be a no-op. App rollback can leave the additive tables/columns in place; dropping them would lose team-view/template/retest data and is not part of app rollback.

## Verification record

Checks use a disposable PostgreSQL container on port 54339. The existing development database on 54329 is untouched. Browser, integration, and performance fixtures use separate databases.

| Check | Result |
| --- | --- |
| Unit | 504 passed |
| UI | 83 passed; no HeroUI PressResponder warnings |
| Integration | 53 passed, 1 S3 fixture skipped |
| Lint | Pass, 0 errors; 38 warnings remain (primarily hook/effect and unused-import guidance) |
| Typecheck | Pass |
| Production build | Pass using `npm run build -- --webpack` |
| Migration upgrade | Populated prior-schema case retained; existing saved view became private |
| Migration reapply | Applied twice successfully, no duplicate migration records |
| Chromium + WebKit | 48 checks passed against the production bundle, including execution reflow/axe, palette focus, and console-error checks |
| Role browser checks | 7 passed, including authentication fixtures and member/viewer/custom-role behavior |

The browser suite covers 17 route families in both themes, 320/390/834/1194/1366/1440/1920px reflow, reduced motion, CSS 200% zoom, keyboard overlays, URL Back, draft preservation, and template → run → retest lineage. Execution has additional both-theme axe and width checks. Covered axe scans have no serious/critical findings. The dirty-inspector check also passed three consecutive runs per engine before the additional Back regression was added. Final checks verify page errors and browser console errors separately from test-runner warnings.

The browser work found and corrected a genuine delayed-navigation race that discarded a newly typed case draft. Inspector navigation now updates history without remounting the workspace. The discard dialog was originally inside the inspector's focus scope. The later user-evaluation pass replaced the inspector with nonmodal full-width details and a collapsed navigation rail; see `ux-simplification.md` for the current behavior. Case creation and structured-step writes now use one transaction; rejected edits retain drafts and release pending state.

### Production performance

Measured with Lighthouse desktop configuration on a separate production fixture containing 5,000 cases, 50 runs, and 10,000 results. These are local measurements, not deployment-network guarantees.

| Route | Performance | Accessibility |
| --- | ---: | ---: |
| Home | 100 | 100 |
| Cases | 100 | 100 |
| Execution | 100 | 100 |

Cases initially scored 88. Replacing repeated heavyweight inline selects with native accessible controls reduced hydration cost. Execution's initial contrast and accessible-name findings were corrected and remeasured; the final execution report has neither finding. Lighthouse still lists non-blocking legacy-JavaScript and render-blocking opportunities.

Reports: `test-results/refinement-evidence/performance/{home,cases,execution}.json`. Check logs are retained in `test-results/refinement-evidence/checks/`. The final template-ownership guard and secondary-form layout changes affect run creation/graph authoring; the measured target pages are unchanged by those changes.

### Visual evidence and audit reconciliation

Before/after captures for 12 core families and contact sheets are in `test-results/refinement-evidence/`. Additional graph and dark-mode screenshots are in `test-results/refinement-production/` and `test-results/refinement-production-final/`. Execution screenshots are in `test-results/refinement-execution-final/`.

The baseline is pre-change Git HEAD, excluding pre-existing uncommitted work. Its only compatibility patch uses direct browser-safe domain imports to avoid a Node hashing module in the client bundle. Disposable fixture counts can differ between captures as workflow tests create runs. Screenshots establish layout changes, not identical business-data comparisons.

Prior contrast, overflow, obstructed checkbox, incorrect sort semantics, unlabeled assignment, and denied-create-control findings were reproduced or reconciled against current code. The final covered browser scans found no page-level horizontal overflow. Table overflow remains local. Contacts for all 17 families and full-size cases/execution captures were visually inspected. This inspection prompted a final shared-label and full-width-field correction for requirements, journeys, components, and risks; all eight scoped reflow checks and all four production light/dark accessibility/console sweeps passed afterward.

Two harness issues were corrected rather than counted as product failures: the login fixture's ambiguous text locator and a URL assertion that rejected valid result query parameters. A parallel test runner also removed another run's output directory; checks now use separate output paths and the affected Lighthouse artifacts were recaptured. Earlier failed logs remain in the checks directory. A WebKit development-mode console sweep also hit a load/stack-frame tooling error; the complete production run passed with both page-error and console-error capture.

### Open qualification gates

- Firefox fails before page startup with `Could not find profile folder`, including a retry using `/tmp`. Its results are **unverified**, not passes.
- Turbopack production compilation is blocked by a host port-binding error. The supported webpack production build passes. The existing deprecated middleware convention remains a follow-up migration.
- S3 integration needs its external fixture. Actual deployment/provider behavior was not qualified here.
- Automated axe, keyboard checks and CSS zoom do not establish screen-reader interoperability or native browser-zoom certification. Those manual checks remain open.
- This is broad representative coverage, not every possible state/role/content combination on every route. Server-render failures outside the covered client list loaders still use the framework error boundary.

The working tree includes pre-existing user changes. Nothing was published or merged. The existing development database remains untouched.

## Reproduce scoped checks

Use disposable databases and fixture credentials; do not point seed commands at a working database.

```sh
npm run lint
npm run typecheck
npm run test:unit
npm run test:ui
DATABASE_URL=<disposable-integration-url> npm run test:integration
DATABASE_URL=<disposable-upgrade-url> TOPOLOGY_OPS_E2E=1 node --import tsx --test tests/ops/migrate-idempotent.ts
DATABASE_URL=<disposable-performance-url> npm run build -- --webpack
PLAYWRIGHT_BASE_URL=http://127.0.0.1:4318 npx playwright test --config=playwright.refinement.config.ts --project=chromium --project=webkit --output=test-results/refinement-verified
```

The refinement browser configuration expects seeded data and `e2e/.auth/admin.json`; the existing setup project creates role sessions. Keep separate `--output` paths when running suites concurrently, and do not change source while collecting final browser evidence.
