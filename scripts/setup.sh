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

require_node() {
  command -v node >/dev/null 2>&1 || die "Node.js 20+ is required."
  command -v npm >/dev/null 2>&1 || die "npm is required."

  local major
  major="$(node -p 'process.versions.node.split(".")[0]')"
  if (( major < 20 )); then
    die "Node.js 20+ is required (found $(node -v))."
  fi
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

# db:migrate loads .env.local via dotenv; other db:* scripts that use
# tsx --env-file already load it themselves.
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

require_node
ensure_env

step "Installing npm packages"
npm install

step "Starting local services"
bash "$ROOT/scripts/ensure-postgres.sh"

step "Preparing local directories"
mkdir -p "$(attachments_dir)"

load_env

# Journaled migrator (drizzle/meta/_journal.json). Fresh DBs get 0000_baseline.
# If this fails on a database created with drizzle-kit push, reset the volume:
#   docker compose down -v && ./scripts/setup.sh
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
