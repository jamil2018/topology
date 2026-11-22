#!/bin/sh
# Run journaled migrations, then the Next.js standalone server.
set -eu

if [ -n "${HOST:-}" ]; then
  export HOSTNAME="$HOST"
fi
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-4317}"

# Production refuse-to-boot on insecure auth defaults. Disposable container
# tests may set TOPOLOGY_ALLOW_INSECURE_DEFAULTS=1 to skip these checks.
if [ "${NODE_ENV:-}" = "production" ] && [ "${TOPOLOGY_ALLOW_INSECURE_DEFAULTS:-}" != "1" ]; then
  if [ -z "${AUTH_SECRET:-}" ]; then
    echo "error: AUTH_SECRET is required in production." >&2
    echo "  Generate one with: openssl rand -base64 32" >&2
    echo "  Set it in .env.prod (or your orchestrator), then restart." >&2
    echo "  For disposable local container tests only: TOPOLOGY_ALLOW_INSECURE_DEFAULTS=1" >&2
    exit 1
  fi
  secret_len=${#AUTH_SECRET}
  if [ "$secret_len" -lt 32 ]; then
    echo "error: AUTH_SECRET must be at least 32 characters (got ${secret_len})." >&2
    echo "  Generate one with: openssl rand -base64 32" >&2
    exit 1
  fi
  if [ "$AUTH_SECRET" = "build-placeholder-not-for-production" ]; then
    echo "error: AUTH_SECRET must not be the build placeholder." >&2
    echo "  Generate a real secret with: openssl rand -base64 32" >&2
    exit 1
  fi
  if [ -z "${AUTH_URL:-}" ]; then
    echo "error: AUTH_URL is required in production." >&2
    echo "  Set AUTH_URL to the public origin (e.g. https://tcm.example.com)." >&2
    exit 1
  fi
fi

echo "Applying database migrations…"
node /app/migrate.cjs

echo "Starting Topology on ${HOSTNAME}:${PORT}"
exec node /app/server.js
