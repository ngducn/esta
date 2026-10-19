#!/usr/bin/env bash
# Usage: tools/ci/strip-key-traces.sh <blob-report-dir>
#
# Makes each Playwright blob report in the directory safe to upload from a public repo. A spec that calls the local
# stack with e2eServiceHeaders() records the service-role key in its trace, so every trace holding a key from
# stack-keys.sh is deleted from the blob. Any other entry holding a key deletes the whole blob and fails.
set -euo pipefail
shopt -s nullglob

dir=${1:?blob report directory}
keys=$(mktemp)
work=$(mktemp -d)
trap 'rm -rf "$keys" "$work"' EXIT
"$(dirname "$0")/stack-keys.sh" >"$keys"
if [ ! -s "$keys" ]; then
	echo "::error::Read no keys from the local Supabase stack, so the blob reports in $dir cannot be checked"
	exit 1
fi

for blob in "$dir"/*.zip; do
	rm -rf "${work:?}"/*
	unzip -qo "$blob" -d "$work"
	stripped=0
	for trace in "$work"/resources/*.zip; do
		if (set +o pipefail && unzip -p "$trace" | grep -aqFf "$keys"); then
			zip -qd "$blob" "resources/${trace##*/}"
			rm "$trace"
			stripped=$((stripped + 1))
		fi
	done
	if grep -raqFf "$keys" "$work"; then
		rm "$blob"
		echo "::error::$blob holds a key of the local Supabase stack outside a trace, so it was deleted"
		exit 1
	fi
	echo "$blob: removed $stripped trace(s) that held a key of the local Supabase stack"
done
