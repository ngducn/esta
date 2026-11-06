#!/usr/bin/env bash
# Prints the secret keys of the slot's local Supabase stack, one per line, so CI can mask them in the public job log
# and keep them out of uploaded reports. The anon and publishable keys are left out because every browser request
# carries them by design. Exits 1 when the stack is not running. The lookup is scripts/stack-secrets.ts, which shares
# the slot path and the `supabase status` call with the web app's slot environment.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
exec node "$root/scripts/stack-secrets.ts"
