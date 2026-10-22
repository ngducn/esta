#!/usr/bin/env bash
# Runs `pnpm db:start "$@"` without printing the stack's keys to the public job log: its output waits in a file until
# every key from stack-keys.sh is masked. When no key could be read, only the lines that name no key are printed.
# A pull refused with toomanyrequests is retried after a pause, alternating ghcr.io and public.ecr.aws: shared runners
# hit registry-wide limits that held one registry for over an hour on 2026-10-23.
set -uo pipefail

here=$(dirname "$0")
log=$(mktemp)
trap 'rm -f "$log"' EXIT
registries=(ghcr.io public.ecr.aws ghcr.io public.ecr.aws)
for attempt in 0 1 2 3; do
	SUPABASE_INTERNAL_IMAGE_REGISTRY=${registries[$attempt]} pnpm db:start "$@" >"$log" 2>&1
	code=$?
	if [ "$code" -eq 0 ] || ! grep -q toomanyrequests "$log"; then
		break
	fi
	echo "db:start was rate limited by ${registries[$attempt]}; retrying"
	pnpm db:stop >/dev/null 2>&1 || true
	sleep $((30 * (attempt + 1)))
done
if keys=$("$here/stack-keys.sh") && [ -n "$keys" ]; then
	sed 's/^/::add-mask::/' <<<"$keys"
	cat "$log"
else
	grep -viE 'key|secret|jwt' "$log"
fi
exit "$code"
