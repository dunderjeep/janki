#!/usr/bin/env bash
# Run the *production* Next server in a systemd user scope.
#
# Use this when janki is the background project and you're actively working in
# borealnet: `next start` serves prebuilt output, so there's no turbopack
# compiler resident and no file watchers — a fraction of the dev server's RAM
# and effectively no idle CPU. Cost: you must `npm run build` to see changes.
set -euo pipefail

MEM_HIGH="${MEM_HIGH:-512M}"
MEM_MAX="${MEM_MAX:-768M}"
CPU_QUOTA="${CPU_QUOTA:-100%}"

# Serve the production build directory, which `next dev` never writes to.
export NEXT_DIST_DIR="${NEXT_DIST_DIR:-.next-prod}"

if [[ ! -d "$NEXT_DIST_DIR" ]]; then
  echo "No $NEXT_DIST_DIR build found — run 'npm run build:prod' first." >&2
  exit 1
fi

if ! command -v systemd-run >/dev/null 2>&1; then
  echo "systemd-run not available; running unconstrained" >&2
  exec npx next start --port "${JANKI_PORT:-3001}" "$@"
fi

exec systemd-run --user --scope --collect \
  --unit="janki-start-$$" \
  --setenv=NEXT_DIST_DIR="$NEXT_DIST_DIR" \
  -p MemoryHigh="$MEM_HIGH" \
  -p MemoryMax="$MEM_MAX" \
  -p CPUQuota="$CPU_QUOTA" \
  -p CPUWeight=50 \
  -- npx next start --port "${JANKI_PORT:-3001}" "$@"
