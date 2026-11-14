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
| Integration | `npm run test:integration` | Vitest API/DB/CLI/MCP (needs Postgres on :54329). RBAC in this suite needs `npm run db:seed:e2e`. |
| E2E smoke | `npm run test:e2e` | Playwright `--project=chromium` (`e2e/smoke.spec.ts`, `e2e/release-gate.spec.ts`) with the demo seed. Start `npm run dev` first, or let Playwright boot the app. |
| All | `npm run test:all` | unit + integration + ui + e2e smoke |

### Release gate

The GitHub Actions job `release-gate` in `.github/workflows/ci.yml` is the umbrella check on every push and pull request to `main`. It exits 0 when lint, typecheck, build, unit, integration, `api-security`, Playwright desktop (`e2e`), and Playwright viewports (`e2e-viewport`) all succeed. A failed dependency fails the gate.

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
npm run test:ui
npm run test:e2e
```

`npm run test:e2e` is the chromium smoke project and uses the demo user from `npm run db:seed`. Release Playwright and the RBAC integration file need the e2e seed. `npm run db:seed:e2e` sets `TOPOLOGY_SEED_MODE=e2e` and adds member, viewer, custom, and the extra projects on top of the demo data.

```bash
npm run db:seed:e2e
npm run test:integration
npx playwright test --project=setup --project=desktop-1440
npx playwright test --project=setup \
  --project=mobile-390 \
  --project=tablet-834 \
  --project=tablet-1194 \
  --project=laptop-1366 \
  --project=desktop-1920
```

`setup` writes `e2e/.auth/{admin,member,viewer,custom}.json`. `desktop-1440` runs the release specs. The viewport projects `mobile-390`, `tablet-834`, `tablet-1194`, `laptop-1366`, and `desktop-1920` run tests tagged `@responsive` or `@a11y`. CI shards those five projects across two runners (`--shard=1/2` and `--shard=2/2`) and uploads the Playwright HTML report and traces when a Playwright job fails.

CI's integration job keeps `npm run db:migrate` and the demo seed (`npm run db:seed`), then runs `npm run test:integration` with `tests/integration/rbac.integration.test.ts` excluded. The `api-security` job uses the same Postgres service on port 54329, runs `npm run db:seed:e2e`, and runs that RBAC file together with the security integration tests, the unauthenticated route sweep, and the webhook, CLI, and MCP integration tests in one Vitest invocation. After `next build`, CI greps `.next/static` for assigned `JIRA_API_TOKEN`, `AUTH_GITHUB_SECRET`, `LINEAR_API_KEY`, and `GITLAB_TOKEN`. The build job also runs `npm audit --omit=dev --audit-level=high` and writes high and critical advisories to the job summary for triage. Issue providers stay on `TOPOLOGY_ISSUE_PROVIDER=mock`; OAuth IdPs are not contacted in CI.

CI should keep unit tests green on every PR. Postgres in CI is the workflow service container.

### Auth in tests

- Unit tests do not hit live OAuth.
- E2E smoke uses the email/password demo path (OAuth buttons only appear when env secrets are set).
- Release Playwright `--project=setup` signs in as the e2e admin, member, viewer, and custom users from `npm run db:seed:e2e`.

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
