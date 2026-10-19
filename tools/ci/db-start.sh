#!/usr/bin/env bash
# Runs `pnpm db:start "$@"` without printing the stack's keys to the public job log: its output waits in a file until
# every key from stack-keys.sh is masked. When no key could be read, only the lines that name no key are printed.
set -uo pipefail

here=$(dirname "$0")
log=$(mktemp)
trap 'rm -f "$log"' EXIT
pnpm db:start "$@" >"$log" 2>&1
code=$?
if keys=$("$here/stack-keys.sh") && [ -n "$keys" ]; then
	sed 's/^/::add-mask::/' <<<"$keys"
	cat "$log"
else
	grep -viE 'key|secret|jwt' "$log"
fi
exit "$code"
