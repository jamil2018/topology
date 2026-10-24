#!/usr/bin/env bash
# Make local Compose Postgres reachable before the app starts.
# Starts Colima when the Docker daemon is down, then `docker compose up -d`.
# Skips Compose when 127.0.0.1:54329 is already accepting connections (e.g. CI).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

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

postgres_listening() {
  (echo >/dev/tcp/127.0.0.1/54329) >/dev/null 2>&1
}

ensure_docker() {
  command -v docker >/dev/null 2>&1 || die "Docker is required to run Postgres. Install Docker Desktop or Colima."

  if docker info >/dev/null 2>&1; then
    compose version >/dev/null
    return 0
  fi

  if command -v colima >/dev/null 2>&1; then
    printf 'Docker is not running. Starting Colima...\n'
    colima start
    local attempt
    for attempt in $(seq 1 60); do
      if docker info >/dev/null 2>&1; then
        printf 'Docker is ready\n'
        compose version >/dev/null
        return 0
      fi
      sleep 2
    done
    die "Colima started but the Docker daemon is still unavailable."
  fi

  die "Docker is installed but not running. Start Docker Desktop or Colima, then re-run."
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

apply_migrations() {
  if [[ ! -d node_modules ]]; then
    return 0
  fi
  if [[ ! -f .env.local && -z "${DATABASE_URL:-}" ]]; then
    return 0
  fi
  printf 'Applying database migrations\n'
  npm run db:migrate
}

if [[ "${SKIP_ENSURE_POSTGRES:-}" == "1" ]]; then
  printf 'SKIP_ENSURE_POSTGRES=1; leaving Postgres as-is\n'
  exit 0
fi

if postgres_listening; then
  printf 'Postgres is already reachable on 127.0.0.1:54329\n'
else
  ensure_docker
  prepare_postgres_container
  if ! docker container inspect topology-postgres >/dev/null 2>&1 \
    || [[ "$(docker inspect -f '{{.State.Status}}' topology-postgres)" != "running" ]]; then
    compose up -d
  fi
  wait_for_postgres
fi

apply_migrations
