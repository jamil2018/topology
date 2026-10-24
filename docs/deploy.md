# Self-hosting Topology

Topology is a single Next.js app plus PostgreSQL. Attachments live on local disk by default, or on S3-compatible object storage (MinIO, Cloudflare R2, AWS S3).

There is no Helm chart yet. Use Compose or any orchestrator that can run the published image and Postgres. Revisit Helm after this Compose stack is stable in your environment.

## Quick production start

Requires Docker Compose and a generated `AUTH_SECRET`.

```bash
cp .env.example .env.prod
# Set AUTH_SECRET (openssl rand -base64 32), AUTH_URL to the public origin,
# and a strong POSTGRES_PASSWORD.
docker compose -f docker-compose.prod.yml up --build -d
```

The app listens on `0.0.0.0:4317` inside the container (override with `HOST` / `PORT`). Postgres is not published to the host. Open http://127.0.0.1:4317 and complete first-run `/setup` — production does **not** seed demo data.

Local development still uses `docker-compose.yml` (Postgres only) and `npm run dev` on `127.0.0.1:4317`. See the [README](../README.md).

## Container image

A multi-stage Dockerfile builds Next.js with `output: "standalone"`. On version tags (`v*`), GitHub Actions publishes:

`ghcr.io/<github.repository>`

that is, `ghcr.io/${{ github.repository }}` from the workflow. Pull only tags that exist on your fork or upstream; this document does not claim a public image is already available.

```bash
# After a v* tag has been pushed to GitHub
docker pull ghcr.io/<owner>/topology:<tag>

TOPOLOGY_IMAGE=ghcr.io/<owner>/topology:<tag> \
  docker compose -f docker-compose.prod.yml up -d --no-build
```

The Next.js standalone server honors `PORT` and `HOSTNAME`. The image entrypoint maps `HOST` → `HOSTNAME` (default `0.0.0.0`) so the process is reachable from a reverse proxy. `npm run dev` stays bound to `127.0.0.1`.

## Reverse proxy and TLS

Terminate TLS in front of the app (Caddy, nginx, Traefik, or a cloud load balancer). Point `AUTH_URL` (and `TOPOLOGY_URL` if used) at the public `https://` origin.

Example Caddyfile:

```caddy
tcm.example.com {
  reverse_proxy 127.0.0.1:4317
}
```

Example nginx location:

```nginx
location / {
  proxy_pass http://127.0.0.1:4317;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-Host $host;
  client_max_body_size 12m;
}
```

Keep `client_max_body_size` (or the equivalent) above the 10 MB attachment limit. WebSockets are not required.

## Environment reference

Copy [`.env.example`](../.env.example) to `.env.prod` for Compose, or inject the same keys in your orchestrator. Compose always overrides `DATABASE_URL` to the in-stack `postgres` hostname.

| Variable | Required | Notes |
| --- | --- | --- |
| `AUTH_SECRET` | yes | `openssl rand -base64 32` |
| `AUTH_URL` | yes | Public origin, e.g. `https://tcm.example.com` |
| `DATABASE_URL` | yes (non-Compose) | `postgresql://user:pass@host:5432/topology` |
| `POSTGRES_PASSWORD` | yes (Compose) | Interpolated into `DATABASE_URL` |
| `HOST` / `PORT` | no | Bind address; image defaults `0.0.0.0:4317` |
| `ATTACHMENTS_DRIVER` | no | `local` (default) or `s3` |
| `ATTACHMENTS_DIR` | no | Local root; image default `/data/attachments` |
| `ATTACHMENTS_S3_BUCKET` | if `s3` | Bucket name |
| `ATTACHMENTS_S3_ENDPOINT` | if MinIO/R2 | e.g. `http://minio:9000` or `https://<account>.r2.cloudflarestorage.com` |
| `ATTACHMENTS_S3_REGION` | no | Default `auto` |
| `ATTACHMENTS_S3_ACCESS_KEY_ID` / `ATTACHMENTS_S3_SECRET_ACCESS_KEY` | if `s3` | |
| `ATTACHMENTS_S3_FORCE_PATH_STYLE` | no | Default on when an endpoint is set (MinIO) |
| `TOPOLOGY_TOKEN_PEPPER` | no | Defaults to `AUTH_SECRET` |
| `TOPOLOGY_GITHUB_WEBHOOK_SECRET` | for GitHub | Fail-closed without a secret |
| OAuth / OIDC pairs | no | GitHub, Google, or generic OIDC |
| Issue tracker keys | no | Default `TOPOLOGY_ISSUE_PROVIDER=mock` |

Do not set `TOPOLOGY_ALLOW_ENV_API_TOKEN` or `TOPOLOGY_ALLOW_DEMO_SEED` in production. Demo seed refuses to run when `NODE_ENV=production` unless that override is set.

## Migrations

Fresh databases are created by the journaled Drizzle migrator, not `drizzle-kit push`.

```bash
npm run db:migrate
```

That runs `src/db/migrate.ts`, which applies `drizzle/meta/_journal.json`. The first (and currently only) entry is `0000_baseline` — a full schema dump through the Phase 1 security tables (`api_tokens` scopes, `login_rate_limits`, `audit_events`, per-repo `webhook_secret`).

The production image runs the same migrator on container start, before `server.js`. Subsequent boots are no-ops once `__drizzle_migrations` records the baseline hash.

Existing databases created with `drizzle-kit push` or the old “replay every `drizzle/*.sql` file” runner are not automatically stamped. For pre-1.0 local data, the supported path is dump → new volume → migrate → restore if you still need rows. Do not replay the retired `0001`–`0017` files; `0001` referenced tables that only appeared in `0003`.

## Backup and restore

Postgres:

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U topology -d topology -Fc > topology.dump

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U topology -d topology --clean --if-exists < topology.dump
```

Attachments:

- **local** — copy the named volume or bind mount (`/data/attachments` in the image). Restore by copying files back to the same path. Storage keys in `attachments.storage_key` must match filenames.
- **s3** — use the bucket’s versioning / replication. Restore objects without renaming keys.

Restore order: database first, then attachment blobs. A DB without blobs yields “file missing” on download; blobs without rows are unreachable.

## Upgrades

1. Take a Postgres dump and an attachments copy (or confirm object-storage versioning).
2. Pull / rebuild the image (`v*` tag or `docker compose … up --build`).
3. Start the new container. Boot applies any new journal entries, then serves traffic.
4. If the app is unhealthy, roll back the image tag. Do not roll back a migration that already expanded schema unless you also restore the dump taken in step 1.

Upgrade guarantee for this baseline: **additive SQL only** lands as new journal files (`0001_…`, `0002_…`). Destructive changes will be called out in [CHANGELOG.md](../CHANGELOG.md). This `0000_baseline` replacement is a one-time break from the unjournaled SQL folder.

## Sizing

A small QA team (tens of users, tens of thousands of cases) is comfortable on:

- App: 1 vCPU, 1–2 GB RAM
- Postgres: 1–2 vCPU, 2 GB RAM, 20+ GB disk
- Attachments: size for screenshots/videos; 10 MB max per file

Raise Postgres `shared_buffers` and disk before adding app replicas. Multiple app containers need a shared attachments driver (`s3` or a networked volume). Session cookies are JWT-side (Auth.js); no sticky sessions required.

Health: `GET /api/health` (HTTP 200 when Postgres answers). Compose uses that endpoint as the app healthcheck.
