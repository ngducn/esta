#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> cleanup.sh
source "$(dirname "$0")/env.sh"
cd "$REPO_ROOT"

# A slot this checkout did not launch belongs to another lane, browse daemon included.
if [[ ! -f "$STACK_MARKER" ]]; then
  echo "Launch did not start slot $ESTA_SLOT ($STACK_MARKER is missing), so Cleanup leaves its stack, web server and browser running."
  exit 1
elif [[ "$(marker_checkout)" != "$REPO_ROOT" ]]; then
  echo "Slot $ESTA_SLOT was launched from $(marker_checkout). Run cleanup.sh in that checkout; this one leaves the slot running."
  exit 1
fi

"$(dirname "$0")/worker.sh" stop
stop_web
if stack_running; then
  pnpm --silent clock:set off
  pnpm --silent db:stop >"$RUN_DIR/db-stop.log" 2>&1 || { tail -20 "$RUN_DIR/db-stop.log" >&2; exit 1; }
  echo "Stopped Supabase on slot $ESTA_SLOT"
fi
rm -f "$STACK_MARKER"
"$B" stop >/dev/null 2>&1 || true

left=0
for port in "$WEB_PORT" "$API_PORT" "$DB_PORT" "$STUDIO_PORT" "$INBUCKET_PORT" "$BROWSE_PORT"; do
  holder="$(listener_pid "$port")"
  if [[ -n "$holder" ]]; then
    echo "FAIL  port $port still held by pid $holder" >&2
    left=1
  fi
done
[[ "$left" == 0 ]] && echo "OK    no listener on ports $WEB_PORT $API_PORT $DB_PORT $STUDIO_PORT $INBUCKET_PORT $BROWSE_PORT"
exit "$left"
