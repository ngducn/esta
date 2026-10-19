#!/usr/bin/env bash
# The fallback for when GitHub Actions is down: run the CI jobs from
# .github/workflows/ci.yml on this machine and post the results to the PR as
# commit statuses (context local-ci/<job>) plus one summary comment.
#
# Usage: tools/ci-local.sh <worktree> <pr-number> <slot> [job ...]
#   jobs default to: check db e2e prod-build design
#
# <worktree> only names the commit: its HEAD must be the PR head. The jobs run
# in a throwaway detached worktree at that commit, as Actions would on a fresh
# checkout, so untracked and gitignored files in <worktree> cannot reach them.
# The throwaway worktree is removed on exit, on failure and on Ctrl-C. Runs
# that include db or e2e stop the slot's Supabase stack before and after, so a
# stack left exited by a Docker restart cannot fail `db:start`.
#
# Any non-empty CI_LOCAL_NO_POST, 0 included, makes no gh call: no PR head
# guard, no statuses, no comment (the summary prints instead). The PR number
# then only names the logs.
#
# Only one run at a time holds the lock directory (CI_LOCAL_LOCK, default
# /tmp/ci-local/lock); the others wait. A run writes its pid into a staging
# directory and renames it into place, so a lock never exists without its pid.
# A lock is stale when its holder exited, or when it has no pid and its mtime
# is over 60 s old. A waiter takes over a stale lock by renaming it to
# <lock>.stale.<inode>-<birth>. rename(2) refuses a non-empty target, so a
# second waiter that judged the same lock cannot move its successor; a lock
# with no pid gets a file first so that its graveyard is not empty.
#
# The db and e2e jobs empty the slot's property-photos bucket before the reset,
# because `db reset` keeps Storage objects from the previous branch. They run
# this checkout's scripts/seed-photos.ts --empty so that older PR heads work.
#
# The e2e job serves a production build (ESTA_E2E_SERVER=build in playwright.config.ts)
# rather than `pnpm dev`, so no test waits for a page to compile.
#
# The e2e job retries a failed test once. Tests that failed and then passed
# are reported as "flaky: N" with their titles, in the job log and the comment.
#
# The db and e2e jobs rerun a reset once when the Supabase CLI answers 502
# during its container restart. Kong keeps the restarted Storage container's old
# IP, so the retry runs db:stop and db:start first and waits for health.
set -uo pipefail

worktree=$(realpath "${1:?worktree path}") || exit 2
pr=${2:?pr number}
slot=${3:?ESTA_SLOT for the local stack}
shift 3
jobs=("$@")
[ ${#jobs[@]} -eq 0 ] && jobs=(check db e2e prod-build design)

repo=ngducn/esta
lock=${CI_LOCAL_LOCK:-/tmp/ci-local/lock}
stage=
grave=
rename_dir() {
	perl -e 'rename($ARGV[0], $ARGV[1]) or exit 1' "$1" "$2"
}
lock_id() {
	stat -f '%i-%B' "$lock" 2>/dev/null
}
is_stale() {
	if [ -n "$1" ]; then
		! kill -0 "$1" 2>/dev/null
		return
	fi
	local mtime
	mtime=$(stat -f %m "$lock" 2>/dev/null) || return 1
	[ $(($(date +%s) - mtime)) -gt 60 ]
}
release_lock() {
	[ -n "$stage" ] && rm -rf "$stage"
	local holder=
	read -r holder 2>/dev/null <"$lock/pid"
	[ "$holder" = $$ ] && mv "$lock" "$lock.released.$$" && rm -rf "$lock.released.$$"
	[ -n "$grave" ] && rm -rf "$grave"
}
trap release_lock EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
mkdir -p "$(dirname "$lock")"
stage=$(mktemp -d "$lock.stage.XXXXXX") || exit 2
echo $$ >"$stage/pid"
echo "PR #$pr ${jobs[*]}" >"$stage/run"
announced=-
until [ ! -e "$lock" ] && rename_dir "$stage" "$lock"; do
	id=$(lock_id) || continue
	holder=
	read -r holder 2>/dev/null <"$lock/pid"
	if is_stale "$holder" && [ "$(lock_id)" = "$id" ]; then
		[ -n "$holder" ] || touch "$lock/taken"
		if rename_dir "$lock" "$lock.stale.$id"; then
			grave=$lock.stale.$id
			echo "took over the ci-local lock from ${holder:+exited pid }${holder:-a lock with no pid}" >&2
		fi
		continue
	fi
	[ "$holder" = "$announced" ] || echo "waiting for the ci-local lock held by pid ${holder:-unknown} ($(cat "$lock/run" 2>/dev/null))" >&2
	announced=$holder
	sleep 5
done
stage=

cd "$worktree" || exit 2
sha=$(git rev-parse HEAD)
if [ -z "${CI_LOCAL_NO_POST:-}" ]; then
	pr_head=$(gh pr view "$pr" --repo "$repo" --json headRefOid -q .headRefOid)
	if [ "$sha" != "$pr_head" ]; then
		echo "worktree HEAD $sha is not PR #$pr head $pr_head; check out the PR head first" >&2
		exit 2
	fi
fi

logdir=/tmp/ci-local/pr-$pr-${sha:0:7}
mkdir -p "$logdir"
rm -f "$logdir/e2e.flaky"
export ESTA_SLOT=$slot

tree=$(mktemp -d /tmp/ci-local/tree.XXXXXX) || exit 2
stop_db() {
	printf '%s\n' "${jobs[@]}" | grep -qE '^(db|e2e)$' && (cd "$tree" && pnpm db:stop >/dev/null 2>&1)
}
cleanup() {
	trap - EXIT
	cd /tmp
	stop_db
	git -C "$worktree" worktree remove --force "$tree" >/dev/null 2>&1 || {
		rm -rf "$tree"
		git -C "$worktree" worktree prune
	}
	release_lock
}
trap cleanup EXIT
git worktree add --detach "$tree" "$sha" >"$logdir/worktree.log" 2>&1 || {
	cat "$logdir/worktree.log" >&2
	exit 2
}
cd "$tree" || exit 2

status() {
	[ -n "${CI_LOCAL_NO_POST:-}" ] && return 0
	gh api -X POST "repos/$repo/statuses/$sha" \
		-f state="$2" -f context="local-ci/$1" -f description="$3" >/dev/null
}

gateway_healthy() {
	[ "$(docker inspect --format '{{.State.Health.Status}}' "supabase_kong_esta-$slot" "supabase_storage_esta-$slot" 2>/dev/null | grep -cx healthy)" = 2 ]
}

ci_root=$(cd "$(dirname "$0")/.." && pwd)
empty_photos() {
	(cd "$ci_root" && ESTA_SLOT_ROOT=$tree node_modules/.bin/tsx scripts/seed-photos.ts --empty)
}

run_e2e() {
	local report=$logdir/e2e-report.json
	CI=1 ESTA_E2E_SERVER=build PLAYWRIGHT_JSON_OUTPUT_NAME=$report pnpm e2e --retries=1 --reporter=list,json
	local code=$?
	[ -f "$report" ] && node "$ci_root/tools/flaky-report.mjs" "$report" | tee "$logdir/e2e.flaky"
	return "$code"
}

reset_db() {
	"$@" 2>&1 | tee "$logdir/reset.log"
	local code=${PIPESTATUS[0]}
	[ "$code" -eq 0 ] && return 0
	grep -q 'Error status 502' "$logdir/reset.log" || return "$code"
	echo "ci-local: $* got a 502 during the container restart; restarting the stack, then retrying once"
	(cd "$tree" && pnpm db:stop && pnpm db:start) || return "$code"
	local waited=0
	until gateway_healthy; do
		[ $waited -ge 120 ] && echo "ci-local: Kong and Storage are not healthy after 120 s" && return "$code"
		sleep 2
		waited=$((waited + 2))
	done
	"$@"
}

run_job() {
	case $1 in
	check)
		pnpm install --frozen-lockfile && VITEST_MAX_WORKERS=3 pnpm check && pnpm run --if-present test:live
		;;
	db)
		pnpm install --frozen-lockfile &&
			pnpm db:start && empty_photos &&
			{ if node -e 'process.exit(require("./package.json").scripts["db:seed:check"]?0:1)'; then reset_db pnpm db:seed:check; else reset_db pnpm db:reset; fi; } &&
			pnpm db:test &&
			pnpm db:types && git diff --exit-code packages/db/src/database.types.ts
		;;
	e2e)
		pnpm install --frozen-lockfile && pnpm db:start && empty_photos && reset_db pnpm db:reset && run_e2e
		;;
	prod-build)
		pnpm install --frozen-lockfile && pnpm run --if-present e2e:prod && pnpm run --if-present check:build-env
		;;
	design)
		pnpm install --frozen-lockfile && pnpm design:detect
		;;
	*)
		echo "unknown job $1" >&2
		return 2
		;;
	esac
}

stop_db
for job in "${jobs[@]}"; do status "$job" pending "running on $(hostname -s)"; done

for job in "${jobs[@]}"; do
	start=$(date +%s)
	if run_job "$job" >"$logdir/$job.log" 2>&1; then r=success; else r=failure; fi
	echo "$r" >"$logdir/$job.result"
	secs=$(($(date +%s) - start))
	status "$job" "$r" "$r in ${secs}s on $(hostname -s); log $logdir/$job.log"
	echo "$job $r ${secs}s"
done

marker='<!-- local-ci -->'
body="$marker
### Local CI for \`${sha:0:7}\`

| Job | Result |
| --- | --- |"
for job in "${jobs[@]}"; do body="$body
| \`$job\` | $(cat "$logdir/$job.result") |"; done
flaky=
[ -s "$logdir/e2e.flaky" ] && flaky="E2E $(head -1 "$logdir/e2e.flaky") (each passed on its one retry)
$(tail -n +2 "$logdir/e2e.flaky")

"
body="$body

${flaky}Ran \`tools/ci-local.sh\` in a fresh worktree on $(hostname -s) with ESTA_SLOT=$slot at $(date '+%Y-%m-%d %H:%M %z'). Logs stay on that machine in \`$logdir/\`."

if [ -n "${CI_LOCAL_NO_POST:-}" ]; then
	echo "$body"
	echo "CI_LOCAL_NO_POST is set, so nothing was posted to PR #$pr."
else
	existing=$(gh api "repos/$repo/issues/$pr/comments" --paginate -q ".[] | select(.body | startswith(\"$marker\")) | .id" | tail -1)
	if [ -n "$existing" ]; then
		gh api -X PATCH "repos/$repo/issues/comments/$existing" -f body="$body" >/dev/null
	else
		gh pr comment "$pr" --repo "$repo" --body "$body" >/dev/null
	fi
fi

for job in "${jobs[@]}"; do [ "$(cat "$logdir/$job.result")" = success ] || exit 1; done
