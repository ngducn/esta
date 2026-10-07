#!/usr/bin/env bash
set -euo pipefail

root=$(git rev-parse --show-toplevel)
checkout=$(mktemp -d)
trap 'rm -rf "$checkout"' EXIT

git -C "$root" ls-files -z --cached --others --exclude-standard | tar -C "$root" --null -T - -cf - | tar -C "$checkout" -xf -
cd "$checkout"
pnpm install --frozen-lockfile --offline --silent

if output=$(env -u CRON_SECRET ESTA_ENV=test pnpm build 2>&1); then
  echo "FAIL: pnpm build succeeded without CRON_SECRET in a checkout with no apps/web/.env.local"
  exit 1
fi
if ! grep -q 'Invalid environment variables' <<<"$output" || ! grep -q 'CRON_SECRET' <<<"$output"; then
  echo "FAIL: pnpm build failed without the zod message naming CRON_SECRET"
  echo "$output"
  exit 1
fi
if [[ -e apps/web/.env.local ]]; then
  echo "FAIL: pnpm build created apps/web/.env.local"
  exit 1
fi
grep -A4 'Invalid environment variables' <<<"$output"
echo "PASS: pnpm build without CRON_SECRET fails with the zod message and writes no apps/web/.env.local"
