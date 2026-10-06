#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> set-theme.sh <light|dark>
source "$(dirname "$0")/env.sh"

theme="${1:-}"
[[ "$theme" == light || "$theme" == dark ]] || { echo "Usage: ESTA_SLOT=<n> set-theme.sh <light|dark>" >&2; exit 2; }

ensure_on_app
"$B" cookie "esta_theme=$theme" >/dev/null
"$B" js "document.documentElement.dataset.theme = '$theme'" >/dev/null
echo "esta_theme=$theme; <html data-theme=\"$("$B" js 'document.documentElement.dataset.theme')\"> on $(current_path)"
