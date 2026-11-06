#!/usr/bin/env bash
# Usage: tools/heavy.sh <command...>   (from any directory; it sources lock.sh beside it)
# Runs a heavy job under the machine-wide lock that root CI also takes. A Playwright run
# narrowed to named spec files or a -g filter may share the machine with one other narrowed run; a full suite, a build,
# Lighthouse or a script runs alone. Touch $CI_LOCAL_DIR/one-at-a-time (default /tmp/ci-local) to make every job run alone again.
set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lock.sh"
narrowed_playwright() {
	[[ -e ${CI_LOCAL_DIR:-/tmp/ci-local}/one-at-a-time ]] && return 1
	local cmd=" $* " arg
	[[ $cmd == *" e2e:"* ]] && return 1
	[[ $cmd == *"playwright test"* || $cmd == *" e2e "* ]] || return 1
	for arg in "$@"; do
		case $arg in -g | --grep | --grep=* | *.spec.ts* | e2e/*) return 0 ;; esac
	done
	return 1
}
if narrowed_playwright "$@"; then take_shared_lock; else take_lock; fi
"$@"
