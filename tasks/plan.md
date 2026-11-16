# Topology validation implementation

Approved scope: attached “Topology validation and regression suite”, 2026-11-16. No deployment, publication, or merge.

## Sequence and acceptance

1. Inventory: preserve release case IDs, inventory every page/API method/package and README promise, map assertions and qualifications. Evidence starts at **not run**, never inferred from filenames. Verify with `npm run test:inventory`.
2. Isolation: disposable PostgreSQL and MinIO containers owned by a unique Compose project; separate onboarding, seeded, migration, and performance databases; temporary attachment storage; cleanup in finally and on termination. No developer database resets. Verify ownership guards and preflight failures.
3. Harness: production server by default; full Chromium and cross-browser core selections; first-failure artifacts; no retries; explicit sanity/regression/release/live commands. Verify collection, unit guard tests, then actual service-backed execution.
4. Report sharing: persisted generation on runs; authorized revoke-all action; atomic audit and increment; legacy generation zero invalidated; enforce on public page and exports. Verify unit, component, database and real HTTP/browser tests.
5. Coverage: strengthen weak assertions, add missing workflows and controlled failure scenarios. Each confirmed defect gets reproduction and regression evidence in `tasks/validation/findings.md`.
6. Release evaluation: visual baselines require inspection; accessibility and responsiveness; migration/backup/restore; measured performance with raw samples and environment. Live providers and screen-reader/native zoom remain separate qualifications.
7. Final gate: lint, typecheck, build, deterministic regression, three retry-free sanity runs, full release evaluation. Report every failure, skip, retry and blocked prerequisite honestly.

## Boundaries

Direct-handler integration tests prove handler/persistence behavior with their stated auth mocks; they do not prove HTTP routing, cookies or session transport. Browser and HTTP tests provide that evidence. Every seeded browser test and integration file now clones a pristine database. Tests within an integration file may intentionally exercise a local lifecycle. Serial execution alone is not fixture isolation.

## Risks

Service availability and browser binaries can block execution; selected suites fail rather than report a pass. Existing legacy tests may reveal defects once run comprehensively. Initial snapshots cannot be accepted without visual review. Hardware-dependent performance records must include fixture size, environment and samples.
