# Functional E2E gaps

Cases skipped with `test.fixme` because the product does not implement them against a seeded database:

- `auth.spec.ts` — First-run `/setup` redirects to `/login` while any user exists (`needsFirstRunSetup`), so creating the first admin cannot run without destroying the seeded database.
- `reports.spec.ts` — Revoked share links are not implemented. There is no revoke control or API for `/share/reports/[token]`.
