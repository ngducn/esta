#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> sign-out.sh
source "$(dirname "$0")/env.sh"

"$B" goto "$WEB_URL/sign-in" >/dev/null
if [[ "$(current_path)" != /sign-in ]]; then
  # /onboarding has no account menu; it shows its own sign-out button.
  [[ "$(current_path)" == /onboarding ]] || "$B" click 'role=button[name=/^(Tài khoản|Account)/]' >/dev/null
  "$B" click 'role=button[name=/^(Đăng xuất|Sign out)$/]' >/dev/null
  for _ in $(seq 1 50); do
    [[ "$(current_path)" == /sign-in ]] && break
    sleep 0.2
  done
fi
if [[ "$(current_path)" != /sign-in ]]; then
  echo "Still signed in: the browser is on $(current_path)" >&2
  exit 1
fi
echo "Signed out; browser on /sign-in"
