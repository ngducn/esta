#!/usr/bin/env bash
# Merges the shards' blob reports into one HTML and JSON report, then counts the tests and names the flaky ones.
set -euo pipefail
cd "$(dirname "$0")/../.."

PLAYWRIGHT_JSON_OUTPUT_NAME=e2e-results.json pnpm exec playwright merge-reports --reporter=html,json "${1:-all-blob-reports}"
node tools/ci/e2e-summary.mjs e2e-results.json
