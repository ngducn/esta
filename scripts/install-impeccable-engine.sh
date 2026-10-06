#!/usr/bin/env bash
# Usage: install-impeccable-engine.sh <dest-dir>
# Downloads the Linux x64 engine named by .claude/skills/impeccable/scripts/VERSION and installs it
# only when its sha256 matches .github/impeccable-engine.sha256. The release's own .sha256 sidecar
# is not trusted: a replaced release asset would ship a matching sidecar.
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
dest=${1:?Usage: install-impeccable-engine.sh <dest-dir>}
version=$(tr -d '[:space:]' < "$repo/.claude/skills/impeccable/scripts/VERSION")
base=${IMPECCABLE_DOWNLOAD_BASE:-https://github.com/pbakaus/impeccable/releases/download}

mkdir -p "$dest/engine-v$version"
curl -fsSL --retry 2 -o "$dest/engine-v$version/impeccable-linux-x64" "$base/engine-v$version/impeccable-linux-x64"
if command -v sha256sum >/dev/null; then sum=(sha256sum); else sum=(shasum -a 256); fi
(cd "$dest" && "${sum[@]}" -c "$repo/.github/impeccable-engine.sha256") >&2
chmod +x "$dest/engine-v$version/impeccable-linux-x64"
echo "$dest/engine-v$version/impeccable-linux-x64"
