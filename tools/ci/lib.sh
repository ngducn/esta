#!/usr/bin/env bash
# Sourced by the job scripts in tools/ci/jobs. Holds what two jobs share, so ci.yml and tools/ci-local.sh run one copy.

gateway_healthy() {
	local slot=${ESTA_SLOT:-0}
	[ "$(docker inspect --format '{{.State.Health.Status}}' "supabase_kong_esta-$slot" "supabase_storage_esta-$slot" 2>/dev/null | grep -cx healthy)" = 2 ]
}

wait_for_gateway() {
	local waited=0
	until gateway_healthy; do
		if [ "$waited" -ge 120 ]; then
			echo "Kong and Storage are not healthy after 120 s" >&2
			return 1
		fi
		sleep 2
		waited=$((waited + 2))
	done
}

# Starts the stack the way the caller does: CI_STACK_EXCLUDE (a comma list of services) goes through tools/ci/db-start.sh,
# which keeps the stack's keys out of the public log and handles rate-limited pulls; without it, plain `pnpm db:start`.
start_stack() {
	if [ -n "${CI_STACK_EXCLUDE:-}" ]; then
		"$(dirname "${BASH_SOURCE[0]}")/db-start.sh" -x "$CI_STACK_EXCLUDE"
	else
		pnpm db:start
	fi
}

# reset_with_retry <command...>: runs a command that resets the database. The Supabase CLI can answer 502 while it restarts
# the Storage container, and Kong keeps that container's old address, so the one retry restarts the stack and waits for
# Kong and Storage to be healthy before it runs the command again.
reset_with_retry() {
	local log code restore=
	log=$(mktemp)
	[[ $- == *e* ]] && restore=1
	set +e
	"$@" 2>&1 | tee "$log"
	code=${PIPESTATUS[0]}
	[ -n "$restore" ] && set -e
	if [ "$code" -eq 0 ] || ! grep -q 'Error status 502' "$log"; then
		rm -f "$log"
		return "$code"
	fi
	rm -f "$log"
	echo "::warning::$* got a 502 while it restarted a container; restarting the stack and retrying once"
	pnpm db:stop && start_stack && wait_for_gateway || return "$code"
	"$@"
}
