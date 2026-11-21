#!/usr/bin/env bash
# Thin wrapper — logic lives in ensure-postgres.mjs (cross-platform for npm predev).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT/scripts/ensure-postgres.mjs"
