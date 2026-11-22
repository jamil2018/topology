# Hosted demo (nightly reset)

There is **no public Topology demo URL** in this repository. This page is the runbook for standing up a read-only demo that resets every night.

Production packaging is shipped: use [docker-compose.prod.yml](../docker-compose.prod.yml) and the multi-stage [Dockerfile](../Dockerfile) (or a published `ghcr.io/<owner>/topology:<tag>` image after a `v*` tag). Details: [docs/deploy.md](deploy.md).

## What “read-only demo” means

- Visitors sign in as a **viewer** (or a dedicated demo user whose workspace role is `viewer`).
- Seeded cases, runs, and pulse data look like a real workspace.
- Nightly job drops the database (and attachment volume), migrates, and seeds again so the instance cannot accumulate junk.

Do not publish admin credentials. Prefer OAuth/OIDC with a shared demo IdP, or a well-known viewer email whose password you rotate.

## Production Compose + seed

From the repo root:

```bash
cp .env.example .env.prod
# Set AUTH_SECRET, AUTH_URL, POSTGRES_PASSWORD, and demo seed overrides below.
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
```

Demo-specific env (in `.env.prod` or injected into the app service):

| Variable | Demo value |
| --- | --- |
| `NODE_ENV` | `production` (Compose sets this on the app) |
| `TOPOLOGY_ALLOW_DEMO_SEED` | `1` (seed is refused in production without this) |
| `TOPOLOGY_SEED_MODE` | `demo` (not `bootstrap`) |
| `TOPOLOGY_ISSUE_PROVIDER` | `mock` |
| `TOPOLOGY_ALLOW_ENV_API_TOKEN` | unset in production |
| `AUTH_SECRET` / `AUTH_URL` | required |
| `POSTGRES_PASSWORD` | required (no silent default) |
| `DEMO_USER_EMAIL` / `DEMO_USER_PASSWORD` | viewer or demo login you actually share |

After the stack is healthy, seed from the host (or an exec into a tooling container with the same `DATABASE_URL`):

```bash
NODE_ENV=production TOPOLOGY_ALLOW_DEMO_SEED=1 TOPOLOGY_SEED_MODE=demo \
  DATABASE_URL=postgresql://topology:<POSTGRES_PASSWORD>@127.0.0.1:<published-or-tunnelled-pg>/topology \
  npm run db:seed
```

Prod Compose does **not** publish Postgres to the host by default. For a demo host, either publish the DB port temporarily for seed, run seed via `docker compose … exec` with a one-shot Node image that shares the compose network, or use the local-dev Compose path below for a throwaway box.

### Local-dev Compose alternative

For a quick throwaway showcase without the production image:

```bash
docker compose up -d
npm install
npm run db:migrate
TOPOLOGY_SEED_MODE=demo npm run db:seed
npm run start   # or: npm run dev
```

After seed, demote the demo user to `viewer` in Settings → Members (or seed a second viewer and disable the admin login). Keep issue filing on `mock` so the demo cannot open real Jira/Linear/GitHub/GitLab tickets.

Health check: `GET /api/health`.

## Nightly reset

Run this from cron / systemd timer / GitHub Actions `schedule` on the demo host (times in UTC). Adjust compose flags and `DATABASE_URL` to match how you run seed:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /opt/topology   # deploy checkout

docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  psql -U topology -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = 'topology' AND pid <> pg_backend_pid();"
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T postgres \
  psql -U topology -d postgres -c "DROP DATABASE IF EXISTS topology; CREATE DATABASE topology OWNER topology;"

# Local attachments volume (skip when ATTACHMENTS_DRIVER=s3)
docker compose --env-file .env.prod -f docker-compose.prod.yml restart app
# App entrypoint re-runs migrations on start. Then seed via your chosen network path:
NODE_ENV=production TOPOLOGY_ALLOW_DEMO_SEED=1 TOPOLOGY_SEED_MODE=demo npm run db:seed
```

Restart the app process after migrate/seed if it caches schema or sessions.

Optional: put a read-only reverse proxy in front (allow `GET` + login `POST`, block `/api/ci/*` writes, or rely on the viewer role). Viewer role is the honest product control; proxy rules are defense in depth.

## What not to do

- Do not invent or document a live `https://demo.topology…` URL here until one is actually hosted.
- Do not seed production workspaces with `TOPOLOGY_ALLOW_DEMO_SEED=1` unless they are this throwaway demo.
- Do not enable a live issue provider on the demo (outbound close would file/close real tickets).
