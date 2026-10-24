# Contributing to Topology

Please read the [code of conduct](CODE_OF_CONDUCT.md) before opening issues or pull requests.

## Prerequisites

- Node.js 20+ (CI uses Node 22)
- Docker (or Colima) for Postgres
- Copy `.env.example` → `.env.local`

## Local setup

```bash
./scripts/setup.sh   # install, Compose Postgres, migrate, seed
npm run dev
```

Or the same steps by hand: `docker compose up -d`, `npm install`, `npm run db:migrate`, `npm run db:seed`.

App: http://127.0.0.1:4317 · Health: http://127.0.0.1:4317/api/health

Demo credentials (air-gap / OAuth unset): `demo@topology.local` / `topology-demo`

## Tests

| Layer | Command | Notes |
| --- | --- | --- |
| Unit | `npm run test:unit` | Vitest (`vitest.packages.config.ts`) — domain, roles, CSV, packages |
| Unit watch | `npm run test:watch` | Same config |
| UI | `npm run test:ui` | Vitest + Testing Library component tests |
| Integration | `npm run test:integration` | Vitest API/DB/CLI/MCP (needs Postgres) |
| E2E | `npm run test:e2e` | Playwright (`playwright.config.ts`). Start `npm run dev` (and migrate/seed) first, or use CI which boots the app. |
| All | `npm run test:all` | unit + integration + ui + e2e |

### Release gate

Run this before tagging a release (and keep it green on `main`):

```bash
docker compose up -d   # or the documented postgres:16 container on :54329
cp .env.example .env.local
npm install
npm run db:migrate && npm run db:seed

npm run lint
npm run typecheck
npm run build

npm run test:unit
npm run test:integration
npm run test:ui
npm run test:e2e
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint, `tsc --noEmit`, `next build`, and the same test suites against a Postgres service container. Issue providers stay on `TOPOLOGY_ISSUE_PROVIDER=mock`; OAuth IdPs are not contacted in CI.

CI should keep unit tests green on every PR. E2E expects the demo user from `db:seed` and Postgres via Compose.

### Auth in tests

- Unit tests do not hit live OAuth.
- E2E uses the email/password demo path (OAuth buttons only appear when env secrets are set).

## Env secrets

Documented in `.env.example`:

- **Auth:** `AUTH_SECRET`, `AUTH_URL`, optional GitHub/Google OAuth, optional `TOPOLOGY_AIR_GAP=1`
- **API / agents:** `TOPOLOGY_API_TOKEN`, `TOPOLOGY_URL`
- **Attachments:** `ATTACHMENTS_DRIVER` (`local` \| `s3`), `ATTACHMENTS_DIR` (default `./data/attachments`)
- **Trackers:** `TOPOLOGY_ISSUE_PROVIDER` (`mock` \| `jira` \| `linear` \| `github`) plus provider credentials

Never commit real OAuth or tracker tokens. Prefer `mock` for local issue filing demos.

## Database

- Use `npm run db:migrate` (journaled Drizzle migrator, `drizzle/meta/_journal.json`). Fresh databases apply `0000_baseline`.
- After schema changes, run `npm run db:generate` to add a new journal entry, then `npm run db:migrate`.
- Do not use `drizzle-kit push` in setup, CI, or production. `npm run db:push` remains a local escape hatch only.
- Production image, Compose, backup, and upgrades: [docs/deploy.md](docs/deploy.md).

## Pull requests

- Keep changes focused; include tests for new domain helpers and API behavior where practical.
- Update `.env.example` / README when adding env vars.
- Do not open secrets or attachment binaries in the repo (`data/attachments` is gitignored).
- Add a [CHANGELOG.md](CHANGELOG.md) entry under **Unreleased** when the change is user-visible.

## Releases

Topology uses [Semantic Versioning](https://semver.org/). The current version is `0.1.0` in the root `package.json`. Workspace packages `@topology/cli`, `@topology/mcp`, `@topology/playwright`, `@topology/jest`, `@topology/cypress`, and `@topology/domain` are public-ready; see `packages/PUBLISHING.md`. The hub app stays private.

1. Move items from **Unreleased** in `CHANGELOG.md` into a new `## [X.Y.Z] - YYYY-MM-DD` section and update the comparison links.
2. Bump `version` in the root `package.json` (and workspace packages if their public API changed).
3. Commit, then tag: `git tag -a vX.Y.Z -m "vX.Y.Z"`.
4. Push the commit and tag: `git push origin HEAD --tags`.
5. Create a GitHub Release from the tag and paste that changelog section as the notes.
