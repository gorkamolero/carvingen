#!/usr/bin/env bash
set -euo pipefail

export DATABASE_PATH="./tmp/e2e-carvingen.sqlite"
export ASSET_STORAGE_PATH="./tmp/e2e-assets"
export PORT="${PORT:-3311}"
export PLAYWRIGHT_BASE_URL="${PLAYWRIGHT_BASE_URL:-http://127.0.0.1:${PORT}}"

reset_e2e_state() {
  mkdir -p tmp
  rm -f tmp/e2e-carvingen.sqlite tmp/e2e-carvingen.sqlite-shm tmp/e2e-carvingen.sqlite-wal
  rm -rf tmp/e2e-assets
  mkdir -p tmp/e2e-assets
}

for spec in \
  tests/e2e/app-load.spec.ts \
  tests/e2e/canvas-local.spec.ts \
  tests/e2e/project-isolation.spec.ts \
  tests/e2e/portfolio-demo.spec.ts
do
  reset_e2e_state
  playwright test --workers=1 "$spec"
done
