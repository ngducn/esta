#!/usr/bin/env bash
# Runs Stryker and removes the stryker-setup-*.js files it leaves in this folder, which eslint then rejects.
set -uo pipefail
cd "$(dirname "$0")"

trap 'rm -f stryker-setup-*.js' EXIT
pnpm exec stryker run "$@"
