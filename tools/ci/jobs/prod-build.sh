#!/usr/bin/env bash
# The prod-build job: a production start hides /dev and /api/test, and a build without CRON_SECRET fails with the zod message.
set -euo pipefail
cd "$(dirname "$0")/../../.."

pnpm e2e:prod
pnpm check:build-env
