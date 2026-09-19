# Topology

Self-hosted test case management with a Linear-like operating hub, CI ingest, issue filing, and an MCP agent plugin.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4 + HeroUI v3
- motion.dev
- Postgres + Drizzle ORM
- Auth.js (OAuth-first GitHub/Google; email/password air-gap fallback)
- `@topology/domain` + `@topology/cli` + `@topology/issue-providers` + `@topology/mcp`
- Vitest + Playwright

## 15-minute success path

1. **Set up and run** — `./scripts/setup.sh` (or `npm run setup`) installs packages, starts Postgres via Compose, writes `.env.local`, syncs the schema, applies migrations, and seeds. Then start the app:

```bash
./scripts/setup.sh
npm run dev
```

The same steps by hand:

```bash
docker compose up -d
cp .env.example .env.local
npm install
npm run db:migrate   # or: npm run db:push
npm run db:seed
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317). Health: [http://127.0.0.1:4317/api/health](http://127.0.0.1:4317/api/health).

2. **OAuth or demo login**
   - **Preferred:** set `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` and/or Google pair in `.env.local`, restart, then **Continue with GitHub/Google**.
   - **Air-gap / unset OAuth:** use **Use email instead** (or the email form when OAuth is off). Demo: `demo@topology.local` / `topology-demo`.
   - Force air-gap copy with `TOPOLOGY_AIR_GAP=1`.

3. **Hub** — land on the operating hub (quality pulse, pending work, milestone readiness).

4. **Invite a teammate** — Settings → Members → invite by email (admin). Share the accept URL; invitee signs in with OAuth (preferred) or email matching the invite.

5. **MCP snippet** — Settings → Connections: copy Cursor/Claude/Codex config with `TOPOLOGY_URL` + `TOPOLOGY_API_TOKEN` (`topo_demo_token_local_dev_only` after seed). Details: [`packages/mcp/README.md`](packages/mcp/README.md).

6. **CI** — Settings → CI, or:

```bash
export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=topo_demo_token_local_dev_only
npm run topology -- junit submit ./fixtures/junit/smoke.xml --source cli
```

Examples: `packages/cli/examples/github-actions.yml`, `packages/cli/examples/Jenkinsfile`.

7. **File an issue** — open the seeded run (or any failed result) → **Create issue** (default `TOPOLOGY_ISSUE_PROVIDER=mock`). Live Jira/Linear/GitHub: set provider + secrets in `.env.local` (see below).

## Auth

| Mode | Behavior |
| --- | --- |
| OAuth configured | Login leads with GitHub/Google; email is behind **Use email instead** |
| OAuth unset or `TOPOLOGY_AIR_GAP=1` | Email/password is the primary path (air-gapped / local) |

Workspace roles: `admin` / `member` / `viewer`. Assign runs and individual results from the run executor.

## Attachments

Result attachments store under `ATTACHMENTS_DIR` (default `./data/attachments`). Compose mounts `topology_attachments` for durable local files.

## Env (OAuth + tracker secrets)

See [`.env.example`](.env.example):

- `AUTH_SECRET`, `AUTH_URL`
- `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`, `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`
- `TOPOLOGY_AIR_GAP`, `ATTACHMENTS_DIR`
- `TOPOLOGY_ISSUE_PROVIDER` + Jira / Linear / GitHub credentials (commented)

Tracker tokens stay server-side; never expose them to the browser or MCP process beyond Topology’s own API token.

### Linear-like UX

- **Command palette** — `⌘K` / `Ctrl+K` (or top-nav Search) to create a case, start a run, file an issue, or jump to pages/cases/runs/folders.
- **Saved views** — name and reuse filter+sort presets on Cases and Runs.
- **Bulk edit** — select cases, then change status, move folder, or add tags.
- **Case history** — click a case key/title to open a minimal activity log (who changed what).

## Scripts

| Script | Purpose |
| --- | --- |
| `./scripts/setup.sh` | Install, start Postgres, migrate, and seed |
| `npm run dev` | Next.js on port 4317 |
| `npm run db:push` | Push Drizzle schema |
| `npm run db:migrate` | Apply `drizzle/*.sql` migrations |
| `npm run db:seed` | Seed demo user, workspace admin, cases, run, milestone, token |
| `npm run topology` | Topology CLI |
| `npm run mcp` | Start `@topology/mcp` stdio server |
| `npm run test` / `test:unit` | Vitest unit tests (domain, auth helpers, packages) |
| `npm run test:integration` | Vitest API/DB/CLI/MCP integration (needs Postgres) |
| `npm run test:ui` | Vitest + Testing Library component tests |
| `npm run test:e2e` | Playwright UI paths (login → hub → run → issue → triage) |
| `npm run test:all` | unit + integration + ui + e2e |

### Testing release gate (F10)

```bash
docker compose up -d   # or the documented postgres:16 container on :54329
cp .env.example .env.local
npm install
npm run db:push && npm run db:seed

npm run test:unit
npm run test:integration
npm run test:ui
npm run test:e2e
```

GitHub Actions (`.github/workflows/ci.yml`) runs the same suites against a Postgres service container. Issue providers stay on `TOPOLOGY_ISSUE_PROVIDER=mock`; OAuth IdPs are not contacted in CI.

Contributor test instructions: [`CONTRIBUTING.md`](CONTRIBUTING.md).

## v1 slice

- OAuth-first auth + workspace invites/roles + result comments/attachments
- Operating hub with quality pulse, milestone Go/At-risk/No-Go, flake + retest queues
- Cases + folders CRUD, CSV import/export
- Manual runs with assign, notes, comments, attachments, pass/fail
- CI JUnit ingest + shard merge (CLI + `/api/ci/*`)
- Automation browser with lightweight flake signals
- Failure triage queue (file/link issue for failures without a linked issue)
- Milestones with configurable readiness thresholds
- Issue create/link/status + retest queue
- Outbound webhooks on `run.completed` / `issue.created` / `intent.stale` / `coverage.dropped` / `proposal.created` (Settings → Webhooks)
- MCP agent plugin + Settings connections/CI/webhooks
- `/api/health` + Compose Postgres (+ attachments volume)
