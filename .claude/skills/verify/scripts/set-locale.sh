#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> set-locale.sh <vi|en>
source "$(dirname "$0")/env.sh"

locale="${1:-}"
[[ "$locale" == vi || "$locale" == en ]] || { echo "Usage: ESTA_SLOT=<n> set-locale.sh <vi|en>" >&2; exit 2; }

ensure_on_app
"$B" cookie "NEXT_LOCALE=$locale" >/dev/null
"$B" reload >/dev/null
lang() { "$B" js 'document.documentElement.lang'; }

if [[ "$(lang)" != "$locale" ]]; then
  if [[ "$(current_path)" != /sign-in && "$(current_path)" != /onboarding ]]; then
    "$B" click 'role=button[name=/^(Tài khoản|Account)/]' >/dev/null
  fi
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
