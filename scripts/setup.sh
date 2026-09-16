#!/usr/bin/env bash
# Prepare a local Topology checkout: install deps, start Compose services,
# apply migrations, and seed demo data. Safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

step() {
  printf '\n==> %s\n' "$1"
}

die() {
  printf 'error: %s\n' "$1" >&2
  exit 1
}

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  elif command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    die "Docker Compose is required. Install Docker Desktop or the Compose plugin."
  fi
}

require_node() {
  command -v node >/dev/null 2>&1 || die "Node.js 20+ is required."
  command -v npm >/dev/null 2>&1 || die "npm is required."

  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( major < 20 )); then
    die "Node.js 20+ is required (found $(node -v))."
  fi
}

require_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is required to run Postgres. Install Docker Desktop or Colima."
  docker info >/dev/null 2>&1 || die "Docker is installed but not running. Start Docker Desktop or Colima, then re-run."
  # Resolve compose now so a missing plugin fails before we install packages.
  compose version >/dev/null
}

ensure_env() {
  if [[ ! -f .env.local ]]; then
    cp .env.example .env.local
    printf 'Created .env.local from .env.example\n'
  else
    printf '.env.local already exists; leaving it in place\n'
  fi

  if grep -q '^AUTH_SECRET=generate-with-openssl-rand-base64-32$' .env.local; then
    local secret
    secret="$(node -e 'process.stdout.write(require("node:crypto").randomBytes(32).toString("base64"))')"
    AUTH_SECRET_VALUE="$secret" node -e '
      const fs = require("node:fs");
      const text = fs.readFileSync(".env.local", "utf8");
      const next = text.replace(
        "AUTH_SECRET=generate-with-openssl-rand-base64-32",
        "AUTH_SECRET=" + JSON.stringify(process.env.AUTH_SECRET_VALUE)
      );
      fs.writeFileSync(".env.local", next);
    '
    printf 'Generated AUTH_SECRET in .env.local\n'
  fi
}

attachments_dir() {
  local line dir
  line="$(grep -E '^ATTACHMENTS_DIR=' .env.local || true)"
  dir="${line#ATTACHMENTS_DIR=}"
  dir="${dir#\"}"
  dir="${dir%\"}"
  if [[ -z "$dir" ]]; then
    dir="./data/attachments"
  fi
  printf '%s' "$dir"
}

# A leftover topology-postgres container (for example after Docker restarts)
# blocks `compose up` because docker-compose.yml pins that container name.
# Removing a stopped container keeps the named data volume.
prepare_postgres_container() {
  local name="topology-postgres"
  if ! docker container inspect "$name" >/dev/null 2>&1; then
    return 0
  fi

  local status
  status="$(docker inspect -f '{{.State.Status}}' "$name")"
  if [[ "$status" == "running" ]]; then
    printf 'Postgres container %s is already running\n' "$name"
    return 0
  fi

  printf 'Removing stopped container %s so Compose can recreate it (data volume is kept)\n' "$name"
  docker rm "$name" >/dev/null
}

# drizzle-kit reads DATABASE_URL from the environment; npm db:* scripts that
# use tsx --env-file already load .env.local themselves.
load_env() {
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    if [[ "$value" == \"*\" && "$value" == *\" ]]; then
      value="${value:1:${#value}-2}"
    elif [[ "$value" == \'*\' && "$value" == *\' ]]; then
      value="${value:1:${#value}-2}"
    fi
    export "$key=$value"
  done < .env.local
}

wait_for_postgres() {
  local attempt
  for attempt in $(seq 1 30); do
    if docker exec topology-postgres pg_isready -U topology -d topology >/dev/null 2>&1; then
      printf 'Postgres is ready\n'
      return 0
    fi
    sleep 2
  done
  die "Postgres did not become ready. Check 'docker compose ps' and 'docker compose logs postgres'."
}

require_node
require_docker
ensure_env

step "Installing npm packages"
npm install

step "Starting local services"
prepare_postgres_container
if ! docker container inspect topology-postgres >/dev/null 2>&1 \
  || [[ "$(docker inspect -f '{{.State.Status}}' topology-postgres)" != "running" ]]; then
  compose up -d
fi
wait_for_postgres

step "Preparing local directories"
mkdir -p "$(attachments_dir)"

load_env

# Push creates the base tables on an empty database. Checked-in SQL assumes
# those tables already exist. On an existing database, push can prompt to
# truncate, so only push when the schema is missing.
if [[ "$(docker exec topology-postgres psql -U topology -d topology -tAc "select to_regclass('public.users') is not null")" != "t" ]]; then
  step "Syncing database schema"
  npx drizzle-kit push
fi

step "Applying database migrations"
npm run db:migrate

step "Seeding demo data"
npm run db:seed

printf '\nTopology is ready for local runs.\n\n'
printf '  App:      npm run dev\n'
printf '  URL:      http://127.0.0.1:4317\n'
printf '  Health:   http://127.0.0.1:4317/api/health\n'
printf '  Login:    demo@topology.local / topology-demo\n'
printf '  Postgres: 127.0.0.1:54329 (docker compose)\n\n'
printf 'Stop services with: docker compose down\n'
