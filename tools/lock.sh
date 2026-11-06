# Sourced by tools/heavy.sh. The lock directories default to /tmp/ci-local and move with CI_LOCAL_DIR, so a test can use its own.
# The machine-wide default is on purpose: every checkout and root CI must meet at the same lock.
# Waiters hold a ticket in $queue and may try for the lock only while their
# ticket is the oldest live one, so a caller that runs many heavy jobs in a row cannot starve another waiter. There are
# two lock slots: take_lock (a full suite, a build, Lighthouse, root CI) needs both, take_shared_lock (a narrowed
# Playwright run) needs one, so two narrowed runs can share the machine and nothing runs beside an exclusive job. A
# lock or ticket whose owner process has died is cleared (a stopped task never runs its EXIT trap).
ci_local_dir=${CI_LOCAL_DIR:-/tmp/ci-local}
lock=$ci_local_dir/root.lock
lock2=$ci_local_dir/root.lock2
queue=$ci_local_dir/queue
oldest_live_ticket() {
	local t pid
	for t in $(ls "$queue" 2>/dev/null | sort); do
		pid=${t##*-}
		if kill -0 "$pid" 2>/dev/null; then echo "$t"; return; fi
		rm -f "$queue/$t"
	done
}
clear_dead_locks() {
	local l owner
	for l in "$lock" "$lock2"; do
		owner=$(cat "$l/pid" 2>/dev/null)
		if [[ -n "$owner" ]] && ! kill -0 "$owner" 2>/dev/null; then
			echo "lock: clearing $l left by dead pid $owner" >&2
			rm -f "$l/pid"; rmdir "$l" 2>/dev/null
		fi
	done
}
try_both() {
	mkdir "$lock" 2>/dev/null || return 1
	mkdir "$lock2" 2>/dev/null && return 0
	rmdir "$lock"; return 1
}
try_one() {
	if mkdir "$lock" 2>/dev/null; then held=("$lock"); return 0; fi
	if mkdir "$lock2" 2>/dev/null; then held=("$lock2"); return 0; fi
	return 1
}
wait_turn() {
	local mode=$1
	mkdir -p "$queue"
	local ticket; ticket="$(python3 -c 'import time; print(time.time_ns())')-$$"
	touch "$queue/$ticket"
	local waited=0
	held=("$lock" "$lock2")
	until [[ "$(oldest_live_ticket)" == "$ticket" ]] && "$mode"; do
		clear_dead_locks
		(( waited % 300 == 0 )) && echo "lock: waiting (${waited}s, owners $(cat "$lock/pid" 2>/dev/null || echo -) $(cat "$lock2/pid" 2>/dev/null || echo -), ahead: $(ls "$queue" | sort | sed -n "1,/$ticket/p" | grep -vc "$ticket"))" >&2
		sleep 5; waited=$((waited + 5))
	done
	rm -f "$queue/$ticket"
	local l; for l in "${held[@]}"; do echo $$ > "$l/pid"; done
	trap 'for l in "${held[@]}"; do rm -f "$l/pid"; rmdir "$l" 2>/dev/null; done' EXIT
}
take_lock() { wait_turn try_both; }
take_shared_lock() { wait_turn try_one; }
