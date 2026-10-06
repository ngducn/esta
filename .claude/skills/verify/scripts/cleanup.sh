#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> cleanup.sh
source "$(dirname "$0")/env.sh"
cd "$REPO_ROOT"

web_pid="$(cat "$WEB_PID_FILE" 2>/dev/null || true)"
if [[ -n "$web_pid" ]] && kill -0 "$web_pid" 2>/dev/null; then
  kill "$web_pid"
  for _ in $(seq 1 50); do
    kill -0 "$web_pid" 2>/dev/null || break
    sleep 0.2
  done
  echo "Stopped web pid $web_pid"
fi
rm -f "$WEB_PID_FILE"

if docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q true; then
  pnpm --silent clock:set off
  pnpm --silent db:stop >"$RUN_DIR/db-stop.log" 2>&1 || { tail -20 "$RUN_DIR/db-stop.log" >&2; exit 1; }
  echo "Stopped Supabase on slot $ESTA_SLOT"
fi

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
