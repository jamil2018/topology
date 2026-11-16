# Ops checks

Current automated operational gates are `npm run test:ops`, `test:performance` and `test:lighthouse`, included in `test:release` and scheduled/manual CI. They provision disposable owned services. The historical standalone/manual recipes below are retained for reference; they are not permission to reset a developer database. See [current commands and evidence](../../tasks/validation/README.md).

Database for local integration tests:

```bash
DATABASE_URL=postgresql://topology:topology@127.0.0.1:54329/topology
TOPOLOGY_API_TOKEN=topo_demo_token_local_dev_only
TOPOLOGY_ISSUE_PROVIDER=mock
```

`vitest.setup.ts` fills those in when they are unset. Integration files skip when `DATABASE_URL` is empty.

## Migration idempotency

Unit coverage, no database: `src/db/migrator.test.ts` checks the journal from `0000_baseline` through `0003_quality_graph_pref`, unstamped reconciliation (`src/db/reconcile-unstamped.sql`), and that `runMigrations` refuses an empty URL.

Apply twice against a live database. The second run is a no-op once `drizzle.__drizzle_migrations` has the journal hashes.

```bash
npm run db:migrate
npm run db:migrate
```

Or the node:test wrapper, which skips unless the flag is set:

```bash
TOPOLOGY_OPS_E2E=1 npx tsx --env-file=.env.local --test tests/ops/migrate-idempotent.ts
```

### Fresh database vs upgrade 0000 to 0003

Fresh volume: point `DATABASE_URL` at an empty database and run `npm run db:migrate` once. Expect journal entries `0000_baseline`, `0001_tcm_parity`, `0002_scale`, and `0003_quality_graph_pref`.

Upgrade: start from a database whose journal contains only `0000_baseline`, then run `npm run db:migrate`. Expect `0001` through `0003` to apply, and a second run to change nothing.

A push-era database (tables present, journal empty) should take the reconcile path in `src/db/migrator.ts` (`shouldReconcileUnstamped`) and then stamp the journal. Do not replay retired pre-journal SQL files.

## Bootstrap seed

```bash
TOPOLOGY_SEED_MODE=bootstrap npm run db:seed
```

Expected log: `Bootstrapped first admin: ...` and the CLI token when `TOPOLOGY_API_TOKEN` is set. Harbor demo cases, runs, and plans are not inserted. `TOPOLOGY_SEED_MODE=demo` (the default) seeds that demo data. Production refuses demo seed unless `TOPOLOGY_ALLOW_DEMO_SEED=1`.

## Docker image and Compose

Build and boot the production stack (needs Docker and a generated `AUTH_SECRET` in `.env.prod`):

```bash
cp .env.example .env.prod
docker compose -f docker-compose.prod.yml up --build -d
```

Checks:

- Migrations run on start. The image entrypoint is `scripts/docker-entrypoint.sh`, which runs `node /app/migrate.cjs` before `server.js`.
- `GET /api/health` returns 200. Compose uses that URL as the app healthcheck.
- `GET /health` redirects to `/api/health`.
- The container is not root. The Dockerfile ends with `USER node`.

```bash
docker compose -f docker-compose.prod.yml exec app id -u
curl -fsS http://127.0.0.1:4317/api/health
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:4317/health
```

`id -u` must not be `0`.

Published images, when a `v*` tag exists: `TOPOLOGY_IMAGE=ghcr.io/<owner>/topology:<tag> docker compose -f docker-compose.prod.yml up -d --no-build`.

## Backup and restore

From `docs/deploy.md`. Restore the database first, then attachment blobs.

```bash
docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_dump -U topology -d topology -Fc > topology.dump

docker compose -f docker-compose.prod.yml exec -T postgres \
  pg_restore -U topology -d topology --clean --if-exists < topology.dump
```

Local attachments live on the `topology_prod_attachments` volume (`/data/attachments` in the image). Storage keys in `attachments.storage_key` must match the filenames you copy back. For `ATTACHMENTS_DRIVER=s3`, restore objects without renaming keys.

## S3 / MinIO

Default CI uses the local disk driver. `tests/integration/s3-attachments.integration.test.ts` skips unless `TOPOLOGY_S3_E2E=1`. When that flag is set the test calls `storeAttachmentFile` and `readAttachmentFile` in `src/lib/attachments.ts` with `ATTACHMENTS_DRIVER=s3`.

Required env:

- `ATTACHMENTS_S3_BUCKET`
- `ATTACHMENTS_S3_ENDPOINT` (for MinIO, for example `http://127.0.0.1:9000`)
- `ATTACHMENTS_S3_ACCESS_KEY_ID`
- `ATTACHMENTS_S3_SECRET_ACCESS_KEY`

Optional: `ATTACHMENTS_S3_REGION` (default `auto`), `ATTACHMENTS_S3_FORCE_PATH_STYLE` (defaults on when an endpoint is set).

```bash
TOPOLOGY_S3_E2E=1 \
ATTACHMENTS_DRIVER=s3 \
ATTACHMENTS_S3_BUCKET=topology \
ATTACHMENTS_S3_ENDPOINT=http://127.0.0.1:9000 \
ATTACHMENTS_S3_REGION=us-east-1 \
ATTACHMENTS_S3_ACCESS_KEY_ID=minioadmin \
ATTACHMENTS_S3_SECRET_ACCESS_KEY=minioadmin \
ATTACHMENTS_S3_FORCE_PATH_STYLE=1 \
npx vitest run --config vitest.integration.config.ts tests/integration/s3-attachments.integration.test.ts
```

## Performance budgets

`test:release` runs measured performance against an isolated 50k-case database. `scripts/perf-bench.ts` records raw samples and enforces the cases-list p95 budget; `e2e/performance.spec.ts` enforces HTTP list, executor and ingest budgets. Heavy performance is excluded from deterministic `test:all` and runs in scheduled/manual release CI.

Seed and measure:

```bash
PERF_CASES=50000 PERF_RUNS=500 npm run db:perf-fixture
npm run db:perf-bench
```

`db:perf-fixture` defaults to 5,000 cases and 50 runs, with at most 200 results on each run. The 50,000-case budget needs `PERF_CASES=50000`. The fixture does not build a 5,000-result run.

Budgets from the release plan:

- Cases list p95 under 500ms at 50,000 cases. `db:perf-bench` prints one `listCasesPage` sample, not a percentile. Compare that sample to 500ms, and repeat the command if you need a p95.
- Run executor stays usable at 5,000 results on one run. Confirm in the executor UI after a run has 5,000 `run_results` rows. The stock fixture does not create that run.
- `POST /api/ci/junit` with 10,000 testcases finishes in under 30s.
- Lighthouse, signed in, Chromium: Performance at least 90, Best Practices at least 90, and Accessibility 100 on `/`, `/cases`, and a run page.

```bash
npx lighthouse http://127.0.0.1:4317/ --only-categories=performance,best-practices,accessibility --chrome-flags="--headless"
npx lighthouse http://127.0.0.1:4317/cases --only-categories=performance,best-practices,accessibility --chrome-flags="--headless"
npx lighthouse http://127.0.0.1:4317/runs/<run-id> --only-categories=performance,best-practices,accessibility --chrome-flags="--headless"
```

`/cases` and the run page need an authenticated browser profile. Lighthouse against a login redirect does not measure those screens. Firefox and WebKit are out of scope for 0.1.x.
