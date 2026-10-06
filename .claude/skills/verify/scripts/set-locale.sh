#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> set-locale.sh <vi|en>
# Sets NEXT_LOCALE and reloads. A signed-in member's saved locale wins over the cookie, so when the page
# keeps the old language this presses the in-app language switch, which saves the member's choice.
source "$(dirname "$0")/env.sh"

locale="${1:-}"
[[ "$locale" == vi || "$locale" == en ]] || { echo "Usage: ESTA_SLOT=<n> set-locale.sh <vi|en>" >&2; exit 2; }

ensure_on_app
"$B" cookie "NEXT_LOCALE=$locale" >/dev/null
"$B" reload >/dev/null
lang() { "$B" js 'document.documentElement.lang'; }

if [[ "$(lang)" != "$locale" ]]; then
  "$B" click "button[lang=\"$locale\"]" >/dev/null
  for _ in $(seq 1 25); do
    [[ "$(lang)" == "$locale" ]] && break
    sleep 0.2
  done
fi
if [[ "$(lang)" != "$locale" ]]; then
  echo "<html lang> is still $(lang) on $(current_path)" >&2
  exit 1
fi
echo "NEXT_LOCALE=$locale; <html lang=\"$locale\"> on $(current_path)"
