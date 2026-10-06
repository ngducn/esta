#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> sign-out.sh
# Drops the lane browser's Supabase session cookies and opens /sign-in. It proves nothing about the
# app's sign-out button; drive that button when sign-out itself is under test.
source "$(dirname "$0")/env.sh"

ensure_on_app
"$B" js "document.cookie.split(';').map((c) => c.split('=')[0].trim()).filter((n) => n.startsWith('sb-')).forEach((n) => { document.cookie = n + '=; Max-Age=0; path=/'; })" >/dev/null
"$B" goto "$WEB_URL/sign-in" >/dev/null
if [[ "$(current_path)" != /sign-in ]]; then
  echo "Still signed in after clearing the sb- cookies: the browser is on $(current_path)" >&2
  exit 1
fi
echo "Signed out; browser on /sign-in"
