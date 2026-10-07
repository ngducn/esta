#!/usr/bin/env bash
# Run the CI jobs from .github/workflows/ci.yml on this machine and post the
# results to the PR as commit statuses (context local-ci/<job>) plus one
# summary comment. GitHub Actions minutes are not used.
#
# Usage: tools/ci-local.sh <worktree> <pr-number> <slot> [job ...]
#   jobs default to: check db e2e prod-build design
set -uo pipefail

worktree=${1:?worktree path}
pr=${2:?pr number}
slot=${3:?ESTA_SLOT for the local stack}
shift 3
jobs=("$@")
[ ${#jobs[@]} -eq 0 ] && jobs=(check db e2e prod-build design)

repo=ngducn/esta
cd "$worktree" || exit 2
sha=$(git rev-parse HEAD)
pr_head=$(gh pr view "$pr" --repo "$repo" --json headRefOid -q .headRefOid)
if [ "$sha" != "$pr_head" ]; then
	echo "worktree HEAD $sha is not PR #$pr head $pr_head; check out the PR head first" >&2
	exit 2
fi

logdir=/tmp/ci-local/pr-$pr-${sha:0:7}
mkdir -p "$logdir"
export ESTA_SLOT=$slot

status() {
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

for job in "${jobs[@]}"; do status "$job" pending "running on $(hostname -s)"; done

for job in "${jobs[@]}"; do
	start=$(date +%s)
	if run_job "$job" >"$logdir/$job.log" 2>&1; then r=success; else r=failure; fi
	echo "$r" >"$logdir/$job.result"
	secs=$(($(date +%s) - start))
	status "$job" "$r" "$r in ${secs}s on $(hostname -s); log $logdir/$job.log"
	echo "$job $r ${secs}s"
done

if printf '%s\n' "${jobs[@]}" | grep -qE '^(db|e2e)$'; then pnpm db:stop >/dev/null 2>&1; fi

marker='<!-- local-ci -->'
body="$marker
### Local CI for \`${sha:0:7}\`

| Job | Result |
| --- | --- |"
for job in "${jobs[@]}"; do body="$body
| \`$job\` | $(cat "$logdir/$job.result") |"; done
body="$body

Ran \`tools/ci-local.sh\` on $(hostname -s) with ESTA_SLOT=$slot at $(date '+%Y-%m-%d %H:%M %z'). Logs stay on that machine in \`$logdir/\`."

existing=$(gh api "repos/$repo/issues/$pr/comments" --paginate -q ".[] | select(.body | startswith(\"$marker\")) | .id" | tail -1)
if [ -n "$existing" ]; then
	gh api -X PATCH "repos/$repo/issues/comments/$existing" -f body="$body" >/dev/null
else
	gh pr comment "$pr" --repo "$repo" --body "$body" >/dev/null
fi

for job in "${jobs[@]}"; do [ "$(cat "$logdir/$job.result")" = success ] || exit 1; done
