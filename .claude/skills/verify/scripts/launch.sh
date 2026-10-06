#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> launch.sh [--variant northstar] [--clock <iso>]
# Starts the slot's Supabase stack, reseeds it, sets the test clock and serves the web app.
source "$(dirname "$0")/env.sh"

variant=full
clock="$DEFAULT_CLOCK"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --variant) variant="$2"; shift 2 ;;
    --clock) clock="$2"; shift 2 ;;
    *) echo "Usage: ESTA_SLOT=<n> launch.sh [--variant full|northstar] [--clock <iso>]" >&2; exit 2 ;;
  esac
done

started=$SECONDS
cd "$REPO_ROOT"

holder="$(listener_pid "$WEB_PORT")"
if [[ -n "$holder" ]] && ! started_by_us "$holder"; then
  echo "Port $WEB_PORT is held by pid $holder, which this skill did not start. Pick another ESTA_SLOT." >&2
  exit 1
fi

pnpm --silent db:start >"$RUN_DIR/db-start.log" 2>&1 || { tail -20 "$RUN_DIR/db-start.log" >&2; exit 1; }
echo "db:start done at $((SECONDS - started)) s"
if [[ "$variant" == northstar ]]; then
  pnpm --silent db:reset:northstar >"$RUN_DIR/db-reset.log" 2>&1 || { tail -20 "$RUN_DIR/db-reset.log" >&2; exit 1; }
else
  pnpm --silent db:reset >"$RUN_DIR/db-reset.log" 2>&1 || { tail -20 "$RUN_DIR/db-reset.log" >&2; exit 1; }
fi
echo "db:reset ($variant) done at $((SECONDS - started)) s"
pnpm --silent clock:set "$clock"

if [[ -z "$holder" ]]; then
  # `pnpm dev` runs this same command, but pnpm puts it in its own process group and drops signals,
  # so the recorded pid would not stop the server.
  nohup node scripts/web.ts dev >"$RUN_DIR/web.log" 2>&1 &
  echo $! >"$WEB_PID_FILE"
fi

for _ in $(seq 1 120); do
  if [[ "$(curl -s -o /dev/null -m 30 -w '%{http_code}' "$WEB_URL/sign-in")" == 200 ]]; then
    echo "Ready: $WEB_URL/sign-in answers 200 after $((SECONDS - started)) s (web pid $(cat "$WEB_PID_FILE"), log $RUN_DIR/web.log)"
    exit 0
  fi
  sleep 1
done
echo "Timed out waiting for $WEB_URL/sign-in. Last lines of $RUN_DIR/web.log:" >&2
tail -20 "$RUN_DIR/web.log" >&2
exit 1
