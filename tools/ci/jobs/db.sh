#!/usr/bin/env bash
# The db job, against a running and unseeded local stack: seed determinism, seed coverage, pgTAP, the web and connector
# integration tests, the generated types and the household export round trip. CI_STACK_EXCLUDE names the services the stack was
# started without, so a restart after a 502 starts it the same way.
set -euo pipefail
cd "$(dirname "$0")/../../.."
source tools/ci/lib.sh

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

reset_with_retry pnpm db:seed:check
pnpm seed:coverage --database
pnpm seed:facts
pnpm db:test
# Each integration file works in its own seeded household; scripts/web-integration.ts sets the test clock first, clears
# it after, and reruns a file once when the local gateway answered it an invalid upstream response.
pnpm --filter web test:integration
# The connector's sign-out, ID cut and folder tests (#220, #223, #461) work in lane households the web files also used, and
# move the database clock, so they run on a fresh seed.
reset_with_retry pnpm db:reset
pnpm --filter @esta/connector test:integration
pnpm db:types
git diff --exit-code packages/db/src/database.types.ts

# Last, because it resets the database: db:reset:empty leaves the migrations and no household rows.
pnpm exec tsx scripts/roundtrip-checks.ts odd-names ryan.lane9@demo.esta.test
pnpm exec tsx scripts/export-household.ts ryan.lane9@demo.esta.test "$tmp/export"
pnpm db:reset:empty
pnpm exec tsx scripts/roundtrip-checks.ts rollback "$tmp/export"
pnpm exec tsx scripts/roundtrip-checks.ts refused "$tmp/export"
node scripts/import-export.ts "$tmp/export"
node scripts/row-counts.ts "$tmp/export" | tee "$tmp/row-counts.log"
grep -q '^tables and files match what this export holds' "$tmp/row-counts.log"
