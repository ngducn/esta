#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> set-theme.sh <light|dark|system>
source "$(dirname "$0")/env.sh"

theme="${1:-}"
[[ "$theme" == light || "$theme" == dark || "$theme" == system ]] || {
  echo "Usage: ESTA_SLOT=<n> set-theme.sh <light|dark|system>" >&2
  exit 2
}

ensure_on_app
"$B" cookie "esta_theme=$theme" >/dev/null
"$B" reload >/dev/null
rendered="$("$B" js 'document.documentElement.dataset.theme')"
if [[ "$rendered" != "$theme" ]]; then
  echo "<html data-theme> is $rendered after a reload of $(current_path); the server did not apply esta_theme=$theme" >&2
  exit 1
fi
echo "esta_theme=$theme; <html data-theme=\"$rendered\"> on $(current_path)"
