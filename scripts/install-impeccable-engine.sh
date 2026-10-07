#!/usr/bin/env bash
set -euo pipefail

repo=$(cd "$(dirname "$0")/.." && pwd)
dest=${1:?Usage: install-impeccable-engine.sh <dest-dir>}
version=$(tr -d '[:space:]' < "$repo/.claude/skills/impeccable/scripts/VERSION")
base=${IMPECCABLE_DOWNLOAD_BASE:-https://github.com/pbakaus/impeccable/releases/download}

mkdir -p "$dest/engine-v$version"
curl -fsSL --retry 2 -o "$dest/engine-v$version/impeccable-linux-x64" "$base/engine-v$version/impeccable-linux-x64"
if command -v sha256sum >/dev/null; then sum=(sha256sum); else sum=(shasum -a 256); fi
pinned_digest="$repo/.github/impeccable-engine.sha256"
(cd "$dest" && "${sum[@]}" -c "$pinned_digest") >&2
chmod +x "$dest/engine-v$version/impeccable-linux-x64"
echo "$dest/engine-v$version/impeccable-linux-x64"
