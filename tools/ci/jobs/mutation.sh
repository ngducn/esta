#!/usr/bin/env bash
# The mutation job: Stryker over the money, allocation and tax sources in packages/core; fails below the break threshold in its config.
set -euo pipefail
cd "$(dirname "$0")/../../.."

pnpm test:mutation
