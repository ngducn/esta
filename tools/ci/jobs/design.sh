#!/usr/bin/env bash
# The design job: the Impeccable detector. On Linux the engine is downloaded and checked against the digest in
# .github/impeccable-engine.sha256; elsewhere the launcher uses the binary committed under the skill, which
# is checked here and by scripts/impeccable-engine.test.ts against .github/impeccable-darwin.sha256.
set -euo pipefail
cd "$(dirname "$0")/../../.."

if [ "$(uname -s)" = Darwin ]; then
	shasum -a 256 -c .github/impeccable-darwin.sha256 >&2
fi
if [ "$(uname -s)" = Linux ] && [ -z "${IMPECCABLE_BIN:-}" ]; then
	IMPECCABLE_BIN=$(scripts/install-impeccable-engine.sh "${RUNNER_TEMP:-$(mktemp -d)}/impeccable")
	export IMPECCABLE_BIN
fi
test "$(.claude/skills/impeccable/scripts/impeccable engine-probe)" = "impeccable-engine $(cat .claude/skills/impeccable/scripts/VERSION)"
pnpm design:detect
