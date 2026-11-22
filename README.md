# Topology

Open-source, self-hosted TestRail alternative with a Linear-grade UX and AI-native quality intelligence.

## Screenshot

Controlled light/dark regression snapshots are in [the visual baseline directory](e2e/visual.spec.ts-snapshots/). They use synthetic fixture data. After the quickstart below, the app is at [http://127.0.0.1:4317](http://127.0.0.1:4317).

## Why Topology vs TestRail / Qase / Kiwi

| | Topology | TestRail | Qase | Kiwi TCMS |
| --- | --- | --- | --- | --- |
| License | Apache-2.0 | Proprietary | Proprietary | Open source |
| Deploy | Self-hosted | Cloud or paid on-prem | Cloud | Self-hosted |
| UX | Linear-like hub and command palette | Classic TCM | Modern SaaS TCM | Django-based TCM |
| Cases and runs | Yes, with CSV and vendor import | Full TCM | Full TCM | Full TCM |
| Structured steps, plans | Structured/shared steps, versions, matrix plans | Yes | Yes | Yes |
| CI | JUnit ingest + CLI | Yes | Yes | Yes |
| Issue trackers | Jira, Linear, GitHub, GitLab | Broad | Broad | Broad |
| Agents | MCP plugin | — | — | — |

Topology is pre-1.0. Use it when you want a self-hosted TCM you can read and run locally. Import from TestRail, Qase, Zephyr Scale, or Xray: [docs/import.md](docs/import.md).

## Quickstart

Requires Node.js 20+ and Docker (or Colima) for Postgres. Local Compose (`docker-compose.yml`) runs Postgres only. Production image, Compose, TLS, backup, and upgrades: [docs/deploy.md](docs/deploy.md). Version tags (`v*`) publish `ghcr.io/<github.repository>` — pull only tags that exist; do not assume a public image is already live.

### macOS / Linux

```bash
./scripts/setup.sh
npm run dev
```

`setup.sh` installs packages, starts Postgres via `docker compose`, writes `.env.local`, applies journaled migrations (`0000_baseline` through `0009_scm_feedback`), and seeds a demo workspace.

### Windows (PowerShell)

```powershell
docker compose up -d
Copy-Item .env.example .env.local
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

### Same steps by hand (any shell)

```bash
docker compose up -d
cp .env.example .env.local
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). Health: [http://127.0.0.1:4317/api/health](http://127.0.0.1:4317/api/health).

- **Preferred login:** set `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`, the Google pair, and/or `AUTH_OIDC_*` in `.env.local`, restart, then **Continue with GitHub/Google/OIDC**.
- **Air-gap / unset OAuth:** **Use email instead**. Demo: `demo@topology.local` / `topology-demo`. Force air-gap copy with `TOPOLOGY_AIR_GAP=1`.
- **Invite a teammate:** Settings → Members (admin). Invitee signs in with OAuth, OIDC, or the invited email.
- **MCP:** Settings → Connections; see [`packages/mcp/README.md`](packages/mcp/README.md). After seed, `TOPOLOGY_API_TOKEN` is `topo_demo_token_local_dev_only`.
- **CI ingest:**

```bash
export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=topo_demo_token_local_dev_only
npm run topology -- junit submit ./fixtures/junit/smoke.xml --source cli
```

Examples: `packages/cli/examples/github-actions.yml`, `packages/cli/examples/Jenkinsfile`. File issues from a failed result (**Create issue**; default `TOPOLOGY_ISSUE_PROVIDER=mock`).

## Auth

| Mode | Behavior |
| --- | --- |
| OAuth configured | Login leads with GitHub and/or Google; email is behind **Use email instead** |
| OIDC configured | Login also shows **Continue with OIDC** (or `AUTH_OIDC_NAME`) when `AUTH_OIDC_ISSUER`, `AUTH_OIDC_ID`, and `AUTH_OIDC_SECRET` are set |
| OAuth/OIDC unset or `TOPOLOGY_AIR_GAP=1` | Email/password is the primary path |

Workspace roles: `admin` / `member` / `viewer`. Assign runs and individual results from the run executor.

## What you get

- Work-first home with assigned work, Continue testing, active runs, and failure/retest queues; aggregate quality metrics live in Overview
- Cases and folders (CRUD, CSV import/export, TestRail/Qase/Zephyr/Xray import), saved views, bulk edit, case history
- Manual runs with structured step results, assignment, notes, comments, attachments, and pass/fail
- Private/team saved views, reusable run templates, reviewed retests with source lineage, and in-app assignment handoffs
- Paginated cases/runs with URL filters and history; per-user/project/run execution context
- Shared steps, case versions, custom fields, and plans with configuration-matrix launches
- Command palette (`⌘K` / `Ctrl+K`) to create a case, start a run, file an issue, or jump
- CI JUnit ingest and shard merge (CLI + `/api/ci/*`), automation browser with flake signals
- Failure triage, issue create/link (Jira / Linear / GitHub / GitLab), outbound webhooks
- MCP agent plugin; `/api/health`

Result attachments store under `ATTACHMENTS_DIR` (default `./data/attachments`) when `ATTACHMENTS_DRIVER=local`. Set `ATTACHMENTS_DRIVER=s3` plus the `ATTACHMENTS_S3_*` vars for MinIO/R2. Compose defines `topology_attachments` for durable local files.

## Packages

This repo is an npm workspaces monorepo. The hub app at the root stays **private**. Workspace packages under `packages/` are developed here via path aliases / `tsx`; public-ready packages (`@topology/domain`, `@topology/cli`, `@topology/playwright`, `@topology/jest`, `@topology/cypress`, `@topology/mcp`) publish compiled `dist/` to npm — see [`packages/PUBLISHING.md`](packages/PUBLISHING.md). `@topology/issue-providers` and `@topology/plugin-sdk` remain private until a separate release. `pytest-topology` installs via pip, not npm.

## Env

See [`.env.example`](.env.example):

- `AUTH_SECRET`, `AUTH_URL`
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
- `AUTH_OIDC_ISSUER` / `AUTH_OIDC_ID` / `AUTH_OIDC_SECRET` (optional `AUTH_OIDC_NAME`)
- `TOPOLOGY_AIR_GAP`, `ATTACHMENTS_DIR`, `ATTACHMENTS_DRIVER`
- `TOPOLOGY_ISSUE_PROVIDER` plus Jira / Linear / GitHub / GitLab credentials (commented)

Tracker tokens stay server-side. Do not put them in the browser or in the MCP process beyond Topology’s own API token.

## Scripts

| Script | Purpose |
| --- | --- |
| `./scripts/setup.sh` | Install, start Postgres, migrate, and seed (macOS/Linux) |
| `npm run dev` | Next.js on port 4317 |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test:sanity` | Unit/component checks and critical Chromium journeys in disposable services |
| `npm run test:regression` / `test:all` | Deterministic unit/component, integration, Python and comprehensive Chromium |
| `npm run test:e2e` / `test:e2e:smoke` | Comprehensive Chromium / narrow smoke selection |
| `npm run test:release` | Regression, core Firefox/WebKit, responsive/a11y, visual, operational and measured scale gates |
| `npm run test:live` | Opt-in sandbox issue-provider read qualification |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Apply journaled Drizzle migrations (`0000_baseline` … `0009_scm_feedback`) |
| `npm run db:seed` | Seed demo user, workspace, cases, run, milestone, token |
| `npm run topology` | Topology CLI |
| `npm run mcp` | Start `@topology/mcp` stdio server |

Production self-hosting: [docs/deploy.md](docs/deploy.md). Tests and the release gate: [CONTRIBUTING.md](CONTRIBUTING.md).

## License

Apache License 2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Copyright 2026 Hasnat Jamil and Topology contributors.

[Contributing](CONTRIBUTING.md) · [Deploy](docs/deploy.md) · [Import](docs/import.md) · [Security](SECURITY.md) · [Code of conduct](CODE_OF_CONDUCT.md) · [Changelog](CHANGELOG.md) · [Roadmap](ROADMAP.md)

Report share links are revocable per report. Apply migrations before upgrading the app. Shared pages and exports honor persisted revocation generations. XLSX downloads are Office Open XML; PDF reports paginate through all rows. Production responses send CSP, frame denial, nosniff, and no-referrer; set `AUTH_URL` to the public HTTPS origin for runtime HSTS (TLS termination still needs deploy verification). Webhook secrets are write-only; configured HMAC signs each attempt. Transient webhook failures retry at most three times with the same delivery ID (best-effort, in-process).
