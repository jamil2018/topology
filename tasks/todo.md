# Validation checklist

- [x] Reconcile every release case, route/method, package and README promise with meaningful assertions or manual qualification.
- [x] Audit conditional passes, silent skips, swallowed errors and shallow exports.
- [x] Disposable owned services and distinct databases; cleanup after failures; fixture factories for all mutable workflows.
- [x] Production Chromium default, smoke alias, cross-browser core and artifact reporting.
- [x] Report revoke-all generation, authorization, atomic audit, legacy invalidation, public page/export checks.
- [x] Complete author/plan/execute/triage/retest/report, automation and quality-graph journeys.
- [x] Controlled failures, accessibility, keyboard and inspected light/dark visual baselines.
- [x] Fresh installation, migration upgrade/idempotency, container persistence, backup/restore.
- [x] Measured 50k-case list p95, 5k-result executor, 10k-result ingest and authenticated Lighthouse budgets.
- [x] CI deterministic regression, cross-browser core, scheduled/manual heavy release evaluation.
- [ ] Lint, typecheck, production build and all required suites pass.
- [ ] Three clean sanity runs without retries and one full release evaluation on final commit.
- [ ] Final critique, raw evidence and exact prerequisites for every unqualified check.

The checked items describe implemented validation coverage and previously observed focused runs, with the assertion boundaries in `validation/feature-families.md`. They do not certify all steps of every legacy manual release case. Final execution status is intentionally external to this commit: `npm run test:acceptance` writes `test-results/acceptance-final.json` and `acceptance-final.md`, requiring the exact clean commit, three consecutive sanity passes and one complete release pass. These immutable receipts are the authority for the last three gates above; no source edit is made afterward merely to tick a box.

Unqualified prerequisites: authorized sandbox credentials/callbacks for OAuth/provider writes/AI; human VoiceOver/NVDA/native zoom operators; physical devices/native Safari; disposable HTTPS/TLS/proxy/production Compose and a separate restore host; temporary external consumer projects and Office/Numbers/Sheets apps. Exact steps remain in inventory.json. Production dependency audit is clean; seven development-only advisories require a separately reviewed breaking toolchain update. No deployment/publication/merge is part of this task.
