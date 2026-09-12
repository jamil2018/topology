# Topology

Self-hosted test case management with a Linear-like operating hub.

## Stack

- Next.js App Router + TypeScript
- Tailwind CSS v4 + HeroUI v3
- motion.dev
- Postgres + Drizzle ORM
- Auth.js (GitHub/Google OAuth when configured, email/password fallback)
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

### OAuth (optional)

Set `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` and/or `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` in `.env.local`. Buttons appear on `/login` when both values for a provider are present.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Next.js on port 4317 |
| `npm run db:push` | Push Drizzle schema |
| `npm run db:seed` | Seed demo user, folders, cases, run |
| `npm run test` | Vitest unit tests |
| `npm run test:e2e` | Playwright smoke |

## v1 slice shipped

- Operating hub with quality pulse
- Cases + folders CRUD (create)
- CSV import/export
- Manual runs with pass/fail recording
- Auth scaffolding (OAuth-ready + credentials)
