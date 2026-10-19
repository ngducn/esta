#!/usr/bin/env bash
# Prints the secret keys of the slot's local Supabase stack, one per line, so CI can mask them in the public job log
# and keep them out of uploaded reports. The anon and publishable keys are left out because every browser request
# carries them by design. Exits 1 when the stack is not running.
set -euo pipefail

root=$(cd "$(dirname "$0")/../.." && pwd)
supabase status -o env --workdir "$root/supabase/.slots/${ESTA_SLOT:-0}" 2>/dev/null |
	sed -nE 's/^(SERVICE_ROLE_KEY|SECRET_KEY|JWT_SECRET|S3_PROTOCOL_ACCESS_KEY_SECRET)="?([^"]+)"?$/\2/p'
