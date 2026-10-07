#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> [ESTA_WORKER=<w>] evidence.sh <pr-id> <slug>
source "$(dirname "$0")/env.sh"

pr="${1:-}"
slug="${2:-}"
if [[ ! "$pr" =~ ^p[0-9]+-[0-9]+$ || ! "$slug" =~ ^[a-z0-9][a-z0-9-]*$ ]]; then
  echo "Usage: ESTA_SLOT=<n> [ESTA_WORKER=<w>] evidence.sh <pr-id like p0-10> <slug like p0-10-sign-in>" >&2
  exit 2
fi

dir="/tmp/swarm-${pr}${ESTA_WORKER:+/worker-${ESTA_WORKER}}"
mkdir -p "$dir"
"$B" screenshot "$dir/$slug.png" >/dev/null
{
  echo "url: $("$B" url)"
  echo "viewport: $("$B" js 'innerWidth + "x" + innerHeight')"
  echo "lang: $("$B" js 'document.documentElement.lang') theme: $("$B" js 'document.documentElement.dataset.theme ?? "unset"')"
  "$B" snapshot
} >"$dir/$slug.aria.txt"
[[ -s "$dir/$slug.png" ]] || { echo "Screenshot $dir/$slug.png is missing or empty" >&2; exit 1; }
echo "$dir/$slug.png"
echo "$dir/$slug.aria.txt"
