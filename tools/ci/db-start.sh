#!/usr/bin/env bash
# Runs `pnpm db:start "$@"` without printing the stack's keys to the public job log: its output waits in a file until
# every key from stack-keys.sh is masked. When no key could be read, only the lines that name no key are printed.
# A pull refused with toomanyrequests is retried after a pause on the other registry that hosts the Supabase images,
# because shared runners hit registry-wide limits that one registry can hold for an hour.
set -uo pipefail

here=$(dirname "$0")
log=$(mktemp)
trap 'rm -f "$log"' EXIT
pause=0
for registry in ghcr.io public.ecr.aws ghcr.io public.ecr.aws; do
	if [ "$pause" -gt 0 ]; then
		echo "db:start was rate limited; retrying on $registry in ${pause}s"
		pnpm db:stop >/dev/null 2>&1 || true
		sleep "$pause"
	fi
	SUPABASE_INTERNAL_IMAGE_REGISTRY=$registry pnpm db:start "$@" >"$log" 2>&1
	code=$?
	if [ "$code" -eq 0 ] || ! grep -q toomanyrequests "$log"; then
		break
	fi
	pause=$((pause + 30))
done
if keys=$("$here/stack-keys.sh") && [ -n "$keys" ]; then
	sed 's/^/::add-mask::/' <<<"$keys"
	cat "$log"
else
	grep -viE 'key|secret|jwt' "$log"
fi
exit "$code"
