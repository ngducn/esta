#!/usr/bin/env bash
# Usage: tools/ci/jobs/e2e.sh [playwright args...]
# The e2e job against a running, seeded stack: `pnpm e2e` on a production build, retrying a failed test once. CI passes
# its project, shard and blob reporter; a run with no arguments is the whole suite.
set -euo pipefail
cd "$(dirname "$0")/../../.."

CI=1 ESTA_E2E_SERVER=build pnpm e2e "$@" --retries=1
