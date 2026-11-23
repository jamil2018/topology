# Candidate launch checks

Record a receipt for each check in the candidate ledger. A receipt identifies the tester, timestamp, environment, candidate SHA, and evidence. Production-like results also identify the tested image digest.

### LAUNCH-FLOW-001 — Manual release journey

**Priority:** P0

Start with the isolated project, invite the tester, author and approve a case, launch the active matrix, execute a failure with evidence, triage and retest, then share, export and revoke the report. Compare stored IDs, revisions, audit events, original results, attachment hashes and totals to the fixture.

### LAUNCH-FLOW-002 — Agent release evidence

**Priority:** P0

Use `tests/integration/agent-operations.integration.test.ts` and the launch-provider receipts. Verify explained selection, reviewed and revision-pinned cases, exact workflow results, permission and replay denial, and the human sign-off. Change the PR head, case revision and policy independently and verify the prior sign-off cannot qualify each changed matrix.

### LAUNCH-FLOW-003 — Agent scope and case review

**Priority:** P0

Use `tests/integration/agent-operations.integration.test.ts`. Exercise owner and project binding, capability denial, stale review, assigned plan and baseline, attachments, replay after storage failure, and legacy cutover. Create drafts through the UI, native CSV, vendor API and CI with review enabled, then check review, rollback and immutable ready revision behavior.

### LAUNCH-FLOW-004 — Historical import and provenance

**Priority:** P0

Use `tests/integration/vendor-history.integration.test.ts`. Verify TestRail/Qase preview leaves storage unchanged, expected totals and raw bytes match after apply, wrong digests fail, per-run retry is resumable, identical replay is idempotent, and source conflicts are reported. Inspect the persisted provenance in the executor and exports.

### LAUNCH-FLOW-005 — Jira revisions and coverage review

**Priority:** P0

Use `e2e/functional/jira-requirements.spec.ts` and `tests/integration/jira-requirements.integration.test.ts`. Link a requirement using an admin session, deliver a signed synthetic event without session cookies, confirm its edge by keyboard, then deliver a new revision. Verify the stale review fails and the exact newer review persists after reload. Check replay, foreign project, history order, and Impact separately.

### LAUNCH-UX-001 — Browser, viewport and visual review

**Priority:** P0

Run release Chromium, Firefox and WebKit projects. Review screenshot diffs and every screen family in both themes. Use macOS Safari, iPhone Safari and Android Chrome on physical devices for the primary journeys. Record versions, orientation, keyboard, touch, file selection, downloads, and preserved focus and context.

### LAUNCH-UX-002 — Observed task completion

**Priority:** P0

Have three independent participants unfamiliar with the candidate perform admin, tester and release-review tasks on staging. Record task, completion, time, wrong turns and assistance. Primary tasks must complete unassisted. Retest resolved dead ends with a fresh participant.

### LAUNCH-A11Y-001 — WCAG and assistive technology

**Priority:** P0

Use the manual accessibility checklist with VoiceOver/Safari and NVDA/Chrome and a mobile screen reader. Exercise complete login, authoring, execution, review, reporting and sharing workflows. Review all axe findings, actual 200% and 400% zoom, OS text size, text spacing, forced colors, visible focus and keyboard handling. Record every applicable WCAG criterion, announcement and focus result.

### LAUNCH-EXPORT-001 — Consumer document checks

**Priority:** P1

Open the generated CSV, XLSX and PDF using the applicable Excel, Numbers, Sheets and PDF clients. Verify original strings and escaped cells, row totals, date boundaries, non-Latin text, pagination and file integrity.

### LAUNCH-OPS-001 — HTTPS Compose qualification

**Priority:** P0

Install the candidate digest on the separate staging Compose host with launch-equivalent settings. Verify non-root execution, no demo data, private backend ports, HTTPS headers and cookies, reverse-proxy redirects, attachment limits, health during restart and SSE through the proxy.

### LAUNCH-OPS-002 — Full upgrade, backup and rollback

**Priority:** P0

Review the local operations receipt for 0000 through 0009 to the current journal. On staging repeat the full upgrade from the actual existing schema if different. Back up the database and blob store at a consistent point, restore both on a separate host, compare hashes and run smoke tests. Record duration, recovery point, and how accepted writes are preserved on rollback.

### LAUNCH-OPS-003 — Sustained workload and recovery

**Priority:** P0

Run the 30-minute staging workload with simultaneous browsing, manual result writes, ingestion and SSE. Record request metrics, resource usage and persisted totals. Verify exact results, no duplicate effects, and recovery after service interruption.

### LAUNCH-PKG-001 — Clean package consumers

**Priority:** P0

Install the exact candidate archives in clean Node and Python environments. Execute CLI and MCP against the candidate plus real Playwright, Jest, Cypress and pytest fixtures. Record package hashes, runner versions, positive and rejected transport receipts, and supported install modes.

### LAUNCH-COVERAGE-001 — Coverage and assertion review

**Priority:** P0

Capture TypeScript and Python line and branch reports on the candidate and baseline. Compare touched modules and review uncovered authorization, persistence, migration, ingestion, and release-evidence branches. Reconcile the assertion-audit candidates with the authored tests, and record explicit dispositions and any verified coverage exceptions.

### LAUNCH-CI-001 — Validation workflow on the frozen commit

**Priority:** P0

Record the workflow-dispatch run whose checkout matches the candidate SHA. Review checks, regression, cross-browser core, the full release evaluation and the aggregate release gate. Require real run receipts with no skips or retry-only passes.
