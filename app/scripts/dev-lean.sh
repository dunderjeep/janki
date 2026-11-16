#!/usr/bin/env bash
# Run the Next dev server inside a systemd user scope with a memory ceiling and
# a CPU cap, so it can't crowd out Emacs / the other project's containers.
#
#   MemoryHigh  soft ceiling: kernel throttles + reclaims past this (no kill)
#   MemoryMax   hard ceiling: OOM-kill backstop, set well above MemoryHigh
#   CPUQuota    200% == 2 of 4 cores
#
# Override any of these inline, e.g.  MEM_HIGH=1500M npm run dev:lean
set -euo pipefail

MEM_HIGH="${MEM_HIGH:-1G}"
MEM_MAX="${MEM_MAX:-2G}"
CPU_QUOTA="${CPU_QUOTA:-200%}"

if ! command -v systemd-run >/dev/null 2>&1; then
  echo "systemd-run not available; running unconstrained" >&2
  exec npx next dev --turbopack --port "${JANKI_PORT:-3001}" "$@"
fi

exec systemd-run --user --scope --collect \
  --unit="janki-dev-$$" \
  -p MemoryHigh="$MEM_HIGH" \
  -p MemoryMax="$MEM_MAX" \
  -p CPUQuota="$CPU_QUOTA" \
  -p CPUWeight=50 \
  -- npx next dev --turbopack --port "${JANKI_PORT:-3001}" "$@"
