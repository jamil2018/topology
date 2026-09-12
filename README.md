# Topology

Self-hosted test case management with a Linear-like operating hub.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4 + HeroUI v3
- motion.dev
- Postgres + Drizzle ORM
- Auth.js (GitHub/Google OAuth when configured, email/password fallback)
- `@topology/domain` + `@topology/cli` workspaces
- `@topology/issue-providers` + `@topology/mcp`
- Vitest + Playwright

## Quick start

```bash
# 1. Start Postgres (Docker / Colima)
docker compose up -d
# If the compose plugin is missing:
# docker run -d --name topology-postgres -e POSTGRES_USER=topology -e POSTGRES_PASSWORD=topology -e POSTGRES_DB=topology -p 54329:5432 -v topology_pgdata:/var/lib/postgresql/data postgres:16-alpine

# 2. Install + migrate + seed
cp .env.example .env.local   # if needed
npm install
npm run db:push
npm run db:seed

# 3. Dev server (uncommon port)
npm run dev
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317).

Demo login: `demo@topology.local` / `topology-demo`

CLI token (local): `topo_demo_token_local_dev_only`

### OAuth (optional)

Set `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` and/or `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in `.env.local`. Buttons appear on `/login` when both values for a provider are present.

## CLI (JUnit / shards)

```bash
export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=topo_demo_token_local_dev_only

npm run topology -- junit submit ./fixtures/junit/smoke.xml --source cli
npm run topology -- runs create --name "CI build" --source github --shards 2
npm run topology -- runs submit-thread --run-id <id> --shard 1 --file ./fixtures/junit/smoke.xml
npm run topology -- runs complete --run-id <id>
```

Examples: `packages/cli/examples/github-actions.yml`, `packages/cli/examples/Jenkinsfile`.

### Issue providers

Default `TOPOLOGY_ISSUE_PROVIDER=mock` files issues in-process. From a failed/blocked result use **Create issue** or **Link**; sync status from the chip; closed remotes surface on the hub **Retest** queue.

### Connect an agent

Open [/connect](http://127.0.0.1:4317/connect) for Cursor / Claude Desktop / Codex snippets, or see [`packages/mcp/README.md`](packages/mcp/README.md).

```bash
export TOPOLOGY_URL=http://127.0.0.1:4317
export TOPOLOGY_API_TOKEN=topo_demo_token_local_dev_only
npx tsx packages/mcp/src/server.ts
```

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js on port 4317 |
| `npm run db:push` | Push Drizzle schema |
| `npm run db:seed` | Seed demo user, folders, cases, run, milestone, API token |
| `npm run topology` | Topology CLI |
| `npm run mcp` | Start `@topology/mcp` stdio server |
| `npm run test` | Vitest unit tests (app + packages) |
| `npm run test:e2e` | Playwright smoke |

## v1 slice

- Operating hub with quality pulse + milestone readiness badge
- Cases + folders CRUD (create)
- CSV import/export
- Manual runs with pass/fail recording
- CI JUnit ingest + shard merge (CLI + `/api/ci/*`)
- Automation runs browser + failure triage queue + flake hints
- Issue create/link/status (mock + Jira/Linear/GitHub) + retest queue
- MCP agent plugin (`@topology/mcp`) + Connect an agent page
- Auth scaffolding (OAuth-ready + credentials)
