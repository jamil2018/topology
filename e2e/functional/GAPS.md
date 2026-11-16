# Functional E2E qualifications

- Empty-instance first-admin setup has a dedicated disposable database and `onboarding` project (`e2e/onboarding.spec.ts`), separate from seeded workflows. The real HTTP concurrency/login journey passed locally on 2026-11-16.
- Report share revocation is implemented with persisted generations. Unit, component and real PostgreSQL handler regressions pass; browser evidence is recorded in `tasks/validation/`.
- Seeded browser tests now clone a pristine template database and run a separate production server per test. Integration files clone independently. These leases isolate users, preferences, projects and mutable catalog rows; tests within a single integration file retain their explicit local lifecycle fixtures.
