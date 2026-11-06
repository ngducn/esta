#!/usr/bin/env bash
# The check job: audit, the whole `pnpm check`, and the live-model-free tests. Needs installed dependencies and Chromium.
set -euo pipefail
cd "$(dirname "$0")/../../.."

pnpm audit --prod --audit-level high
pnpm check
pnpm test:live
