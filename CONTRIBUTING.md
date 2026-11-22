# Contributing to Topology

Please read the [code of conduct](CODE_OF_CONDUCT.md) before opening issues or pull requests.

## Prerequisites

- Node.js 20+ (CI uses Node 22)
- Docker (or Colima) for Postgres
- Copy `.env.example` → `.env.local`

## Local setup

```bash
./scripts/setup.sh   # install, Compose Postgres, migrate, seed (macOS/Linux)
npm run dev
```

Or the same steps by hand: `docker compose up -d`, `npm install`, `npm run db:migrate`, `npm run db:seed`.

**Windows (PowerShell):** `docker compose up -d`; `Copy-Item .env.example .env.local`; then `npm install`, `npm run db:migrate`, `npm run db:seed`, `npm run dev`.

App: http://127.0.0.1:4317 · Health: http://127.0.0.1:4317/api/health

Demo credentials (air-gap / OAuth unset): `demo@topology.local` / `topology-demo`

## Tests

Validation requires Node 22, Python 3 + pytest, Docker Compose v2, and Playwright browsers (`npx playwright install chromium firefox webkit`). The harness provisions disposable PostgreSQL/MinIO services and temporary attachments, and cleans up its own resources after failures. Never reset the developer database for tests.

| Layer | Command | Notes |
| --- | --- | --- |
| Unit | `npm run test:unit` | Deterministic business rules and package contracts |
| Components | `npm run test:ui` | Interactions, validation, focus and rollback |
| Integration | `npm run test:integration` | All PostgreSQL/MinIO handler, CLI and MCP checks; no missing-service skips |
| Comprehensive browser | `npm run test:e2e` | Chromium with real authentication on a production standalone server |
| Smoke | `npm run test:e2e:smoke` | Original two-spec smoke/release-gate selection |
| Sanity | `npm run test:sanity` | Unit/component and critical Chromium journeys |
| Regression / all | `npm run test:regression` / `test:all` | Unit/component/integration/Python and comprehensive Chromium |
| Release | `npm run test:release` | Regression, Firefox/WebKit core, responsive/a11y, visual, operations, Lighthouse and measured scale |
| Optional live | `npm run test:live` | Explicit sandbox-provider read qualification |

`test:e2e:debug` is the explicit development-server option against a separately prepared disposable database. Release checks never reuse a development server and never retry failed tests. A selected suite with skipped or retry-only browser outcomes fails its gate.

CI runs lint, typecheck, inventory, deterministic regression and cross-browser core on pull requests. Scheduled/manual evaluation adds the heavier release gates. `release-gate` requires every selected job to succeed. Reports are uploaded on success and failure and include commit, dirty state, environment, command timing, skips and retry history. High/critical production dependency advisories fail the checks job; the integration suite checks the built client bundle for secret assignments.

See [validation commands and evidence](tasks/validation/README.md), [release plan](docs/test-plan.md), and [remaining qualifications](tasks/todo.md). Initial/changed visual baselines require inspection. Native zoom, screen-reader behavior and live provider writes require separate recorded qualifications. Three clean retry-free sanity runs and a complete release evaluation on the final revision are required for acceptance.

## Env secrets

Documented in `.env.example`:

- **Auth:** `AUTH_SECRET`, `AUTH_URL`, optional GitHub/Google OAuth, optional generic OIDC (`AUTH_OIDC_*`), optional `TOPOLOGY_AIR_GAP=1`
- **API / agents:** `TOPOLOGY_API_TOKEN`, `TOPOLOGY_URL`
- **Attachments:** `ATTACHMENTS_DRIVER` (`local` \| `s3`), `ATTACHMENTS_DIR` (default `./data/attachments`)
- **Trackers:** `TOPOLOGY_ISSUE_PROVIDER` (`mock` \| `jira` \| `linear` \| `github`) plus provider credentials

Never commit real OAuth or tracker tokens. Prefer `mock` for local issue filing demos.

## Database

- Use `npm run db:migrate` (journaled Drizzle migrator, `drizzle/meta/_journal.json`). Fresh databases apply `0000_baseline` through `0009_scm_feedback`.
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
