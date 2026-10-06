#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> doctor.sh
# Read-only. Prints one OK or FAIL line per check, each FAIL with the command that fixes it.
source "$(dirname "$0")/env.sh"
set +e

failed=0
ok() { printf 'OK    %-9s %s\n' "$1" "$2"; }
fail() { printf 'FAIL  %-9s %s. Fix: %s\n' "$1" "$2" "$3"; failed=1; }

if docker info >/dev/null 2>&1; then
  ok docker "daemon answers"
else
  fail docker "daemon does not answer" "start Docker Desktop"
fi

db_running="$(docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null)"
api_code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:${API_PORT}/rest/v1/")"
if [[ "$db_running" == true && "$api_code" =~ ^(200|401)$ ]]; then
  ok supabase "$DB_CONTAINER running, API on $API_PORT answers $api_code"
else
  fail supabase "$DB_CONTAINER running=${db_running:-absent}, API on $API_PORT answers ${api_code}" "ESTA_SLOT=$ESTA_SLOT pnpm db:start"
fi

web_holder="$(listener_pid "$WEB_PORT")"
web_code="$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$WEB_URL/sign-in")"
if [[ -z "$web_holder" ]]; then
  fail web "nothing listens on $WEB_PORT" "ESTA_SLOT=$ESTA_SLOT .claude/skills/verify/scripts/launch.sh"
elif ! started_by_us "$web_holder"; then
  fail web "pid $web_holder holds $WEB_PORT but launch.sh did not start it" "use another ESTA_SLOT; never drive a server you did not start"
elif [[ "$web_code" != 200 ]]; then
  fail web "/sign-in answers $web_code" "read $RUN_DIR/web.log, then ESTA_SLOT=$ESTA_SLOT .claude/skills/verify/scripts/cleanup.sh and launch.sh"
else
  ok web "$WEB_URL/sign-in answers 200 from pid $web_holder"
fi

mail_code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://127.0.0.1:${INBUCKET_PORT}/api/v1/messages?limit=1")"
if [[ "$mail_code" == 200 ]]; then
  ok inbucket "mail API on $INBUCKET_PORT answers 200"
else
  fail inbucket "mail API on $INBUCKET_PORT answers $mail_code" "ESTA_SLOT=$ESTA_SLOT pnpm db:start"
fi

if [[ -x "$B" ]]; then
  ok browse "$B (state $BROWSE_STATE_FILE, port $BROWSE_PORT)"
else
  fail browse "$B is missing or not executable" "cd ~/.claude/skills/gstack && ./setup"
fi

clock="$(docker exec "$DB_CONTAINER" psql -U postgres -tAc 'select frozen_now from public.test_clock' 2>/dev/null | head -1)"
if [[ -n "$clock" ]]; then
  ok clock "test_clock frozen_now $clock"
else
  fail clock "no test_clock row on slot $ESTA_SLOT" "ESTA_SLOT=$ESTA_SLOT pnpm clock:set $DEFAULT_CLOCK"
fi

exit "$failed"
