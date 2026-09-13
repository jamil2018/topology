# Contributing to Topology

## Prerequisites

- Node.js 20+
- Docker (or Colima) for Postgres
- Copy `.env.example` → `.env.local`

## Local setup

```bash
docker compose up -d
npm install
npm run db:migrate   # or db:push
npm run db:seed
npm run dev
```

App: http://127.0.0.1:4317 · Health: http://127.0.0.1:4317/api/health

Demo credentials (air-gap / OAuth unset): `demo@topology.local` / `topology-demo`

## Tests

| Layer | Command | Notes |
| --- | --- | --- |
| Unit | `npm run test` | Vitest (`vitest.packages.config.ts`) — domain, roles, CSV, packages |
| Unit watch | `npm run test:watch` | Same config |
| UI / E2E | `npm run test:e2e` | Playwright against a running app (`playwright.config.ts`). Start `npm run dev` (and migrate/seed) first. |

CI should keep unit green on every PR. E2E expects the demo user from `db:seed` and Postgres via Compose.

### Auth in tests

- Unit tests do not hit live OAuth.
- E2E uses the email/password demo path (OAuth buttons only appear when env secrets are set).

## Env secrets

Documented in `.env.example`:

- **Auth:** `AUTH_SECRET`, `AUTH_URL`, optional GitHub/Google OAuth, optional `TOPOLOGY_AIR_GAP=1`
- **API / agents:** `TOPOLOGY_API_TOKEN`, `TOPOLOGY_URL`
- **Attachments:** `ATTACHMENTS_DIR` (default `./data/attachments`)
- **Trackers:** `TOPOLOGY_ISSUE_PROVIDER` (`mock` \| `jira` \| `linear` \| `github`) plus provider credentials

Never commit real OAuth or tracker tokens. Prefer `mock` for local issue filing demos.

## Database

- Prefer `npm run db:migrate` for checked-in SQL under `drizzle/`.
- `npm run db:push` syncs the Drizzle schema directly (handy during development).
- After schema changes that add collaboration tables, re-run migrate/push then seed if the DB is empty.

## Pull requests

- Keep changes focused; include tests for new domain helpers and API behavior where practical.
- Update `.env.example` / README when adding env vars.
- Do not open secrets or attachment binaries in the repo (`data/attachments` is gitignored).
