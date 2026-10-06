#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> sign-in.sh <email>
source "$(dirname "$0")/env.sh"

email="${1:?Usage: ESTA_SLOT=<n> sign-in.sh <email>}"
cd "$REPO_ROOT"

"$(dirname "$0")/sign-out.sh" >/dev/null
node scripts/inbucket-code.ts --clear "$email"
"$B" fill 'input[name="email"]' "$email" >/dev/null
"$B" click 'button[value="send"]' >/dev/null
"$B" wait 'input[name="code"]' >/dev/null
code="$(node scripts/inbucket-code.ts "$email")"
"$B" fill 'input[name="code"]' "$code" >/dev/null
"$B" click 'button[value="verify"]' >/dev/null

for _ in $(seq 1 50); do
  path="$(current_path)"
  if [[ "$path" != /sign-in ]]; then
    "$B" wait --load >/dev/null
    echo "Signed in as $email; browser on $path"
    exit 0
  fi
  sleep 0.2
done
echo "Still on /sign-in 10 s after submitting the code for $email. Page text: $("$B" text 2>/dev/null | head -5)" >&2
exit 1
