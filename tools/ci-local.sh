#!/usr/bin/env bash
# Run the CI jobs from .github/workflows/ci.yml on this machine and post the
# results to the PR as commit statuses (context local-ci/<job>) plus one
# summary comment. GitHub Actions minutes are not used.
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
set -uo pipefail

worktree=$(realpath "${1:?worktree path}") || exit 2
pr=${2:?pr number}
slot=${3:?ESTA_SLOT for the local stack}
shift 3
jobs=("$@")
[ ${#jobs[@]} -eq 0 ] && jobs=(check db e2e prod-build design)

repo=ngducn/esta
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
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP
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

run_job() {
	case $1 in
	check)
		pnpm install --frozen-lockfile && pnpm check && pnpm run --if-present test:live
		;;
	db)
		pnpm install --frozen-lockfile &&
			pnpm db:start &&
			{ if node -e 'process.exit(require("./package.json").scripts["db:seed:check"]?0:1)'; then pnpm db:seed:check; else pnpm db:reset; fi; } &&
			pnpm db:test &&
			pnpm db:types && git diff --exit-code packages/db/src/database.types.ts
		;;
	e2e)
		pnpm install --frozen-lockfile && pnpm db:start && pnpm db:reset && pnpm e2e
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
body="$body

Ran \`tools/ci-local.sh\` in a fresh worktree on $(hostname -s) with ESTA_SLOT=$slot at $(date '+%Y-%m-%d %H:%M %z'). Logs stay on that machine in \`$logdir/\`."

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
