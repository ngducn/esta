#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> sign-in.sh <email> [--password]
# Signs in with the mailbox code on /sign-in/code, or with --password through /sign-in with the seed's demo password.
source "$(dirname "$0")/env.sh"

email="${1:?Usage: ESTA_SLOT=<n> sign-in.sh <email> [--password]}"
mode="${2:-}"
[[ -z "$mode" || "$mode" == --password ]] || { echo "Usage: ESTA_SLOT=<n> sign-in.sh <email> [--password]" >&2; exit 2; }
cd "$REPO_ROOT"

"$(dirname "$0")/sign-out.sh" >/dev/null
if [[ "$mode" == --password ]]; then
  form=/sign-in
  password="$(node -e "import('./supabase/seed/generator/households.ts').then((seed) => process.stdout.write(seed.DEMO_PASSWORD))")"
  "$B" fill 'input[name="email"]' "$email" >/dev/null
  "$B" fill 'input[name="password"]' "$password" >/dev/null
  "$B" click 'button[value="sign-in"]' >/dev/null
else
  form=/sign-in/code
  "$B" goto "$WEB_URL$form" >/dev/null
  node scripts/inbucket-code.ts --clear "$email"
  "$B" fill 'input[name="email"]' "$email" >/dev/null
  "$B" click 'button[value="send"]' >/dev/null
  "$B" wait 'input[name="code"]' >/dev/null
  code="$(node scripts/inbucket-code.ts "$email")"
  "$B" fill 'input[name="code"]' "$code" >/dev/null
  "$B" click 'button[value="verify"]' >/dev/null
fi

for _ in $(seq 1 50); do
  path="$(current_path)"
  if [[ "$path" != "$form" ]]; then
    "$B" wait --load >/dev/null
    echo "Signed in as $email; browser on $path"
    exit 0
  fi
  sleep 0.2
done
echo "Still on $form 10 s after submitting for $email. Page text: $("$B" text 2>/dev/null | head -5)" >&2
exit 1
