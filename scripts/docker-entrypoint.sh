#!/bin/sh
# Run journaled migrations, then the Next.js standalone server.
set -eu

if [ -n "${HOST:-}" ]; then
  export HOSTNAME="$HOST"
fi
export HOSTNAME="${HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-4317}"

echo "Applying database migrations…"
node /app/migrate.cjs

echo "Starting Topology on ${HOSTNAME}:${PORT}"
exec node /app/server.js
