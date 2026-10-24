# Hosted demo (nightly reset)

There is **no public Topology demo URL** in this repository. This page is the runbook for standing up a read-only demo that resets every night.

A production Compose file and GHCR image are a separate ops track. Until those land, run the app the same way as local quickstart: Compose for Postgres, Node for the app.

## What “read-only demo” means

- Visitors sign in as a **viewer** (or a dedicated demo user whose workspace role is `viewer`).
- Seeded cases, runs, and pulse data look like a real workspace.
- Nightly job drops the database (and attachment volume), migrates, and seeds again so the instance cannot accumulate junk.

Do not publish admin credentials. Prefer OAuth with a shared demo IdP, or a well-known viewer email whose password you rotate.

## Compose + seed

From the repo root, with [`.env.example`](../.env.example) copied to `.env.local` (or container env):

```bash
docker compose up -d
npm install
npm run db:migrate
# Demo data is required for a showcase instance:
TOPOLOGY_SEED_MODE=demo npm run db:seed
npm run start   # or: npm run dev  for a throwaway box
```

Production-like env:

| Variable | Demo value |
| --- | --- |
| `NODE_ENV` | `production` |
| `TOPOLOGY_ALLOW_DEMO_SEED` | `1` (seed is refused in production without this) |
| `TOPOLOGY_SEED_MODE` | `demo` (not `bootstrap`) |
| `TOPOLOGY_ISSUE_PROVIDER` | `mock` |
| `TOPOLOGY_ALLOW_ENV_API_TOKEN` | unset in production |
| `AUTH_SECRET` / `AUTH_URL` | required |
| `DATABASE_URL` | Compose Postgres (`postgresql://topology:topology@127.0.0.1:54329/topology` locally) |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | viewer or demo login you actually share |

After seed, demote the demo user to `viewer` in Settings → Members (or seed a second viewer and disable the admin login). Keep issue filing on `mock` so the demo cannot open real Jira/Linear/GitHub tickets.

Health check: `GET /api/health`.

## Nightly reset

Run this from cron / systemd timer / GitHub Actions `schedule` on the demo host (times in UTC):

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/topology   # deploy checkout

docker compose exec -T postgres \
  psql -U topology -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'topology' AND pid <> pg_backend_pid();"
docker compose exec -T postgres \
  psql -U topology -d postgres -c "DROP DATABASE IF EXISTS topology; CREATE DATABASE topology OWNER topology;"

rm -rf ./data/attachments
mkdir -p ./data/attachments

NODE_ENV=production TOPOLOGY_ALLOW_DEMO_SEED=1 TOPOLOGY_SEED_MODE=demo npm run db:migrate
NODE_ENV=production TOPOLOGY_ALLOW_DEMO_SEED=1 TOPOLOGY_SEED_MODE=demo npm run db:seed
```

Restart the app process after migrate/seed if it caches schema or sessions.

Optional: put a read-only reverse proxy in front (allow `GET` + login `POST`, block `/api/ci/*` writes, or rely on the viewer role). Viewer role is the honest product control; proxy rules are defense in depth.

## What not to do

- Do not invent or document a live `https://demo.topology…` URL here until one is actually hosted.
- Do not seed production workspaces with `TOPOLOGY_ALLOW_DEMO_SEED=1` unless they are this throwaway demo.
- Do not enable a live issue provider on the demo (outbound close would file/close real tickets).
