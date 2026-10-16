#!/usr/bin/env bash
# Usage: ESTA_SLOT=<n> worker.sh start replay|live | stop | status
source "$(dirname "$0")/env.sh"

WORKER_PID_FILE="$RUN_DIR/worker.pid"
WORKER_LOG="$RUN_DIR/worker.log"

our_worker_pid() {
  local pid
  pid="$(cat "$WORKER_PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" && "$(ps -o command= -p "$pid" 2>/dev/null)" == *scripts/agent-dev.ts* ]] && echo "$pid"
}

case "${1:-}" in
  start)
    mode="${2:-}"
    if [[ "$mode" != replay && "$mode" != live ]]; then
      echo "Usage: ESTA_SLOT=<n> worker.sh start replay|live" >&2
      exit 2
    fi
    if pid="$(our_worker_pid)"; then
      echo "A worker already runs on slot $ESTA_SLOT (pid $pid). Run worker.sh stop first." >&2
      exit 1
    fi
    cd "$REPO_ROOT"
    # Live mode reads CLAUDE_CODE_OAUTH_TOKEN and ESTA_MODEL_ROUTINE from apps/agent/.env.local or the shell; the log never prints them.
    ESTA_AGENT_MODE="$mode" nohup node --import tsx scripts/agent-dev.ts >"$WORKER_LOG" 2>&1 &
    echo $! >"$WORKER_PID_FILE"
    for _ in $(seq 1 60); do
      if grep -q '^\[agent\] worker .* started' "$WORKER_LOG"; then
        echo "Worker started on slot $ESTA_SLOT in $mode mode (pid $(cat "$WORKER_PID_FILE"), log $WORKER_LOG)"
        exit 0
      fi
      if ! kill -0 "$(cat "$WORKER_PID_FILE")" 2>/dev/null; then break; fi
      sleep 0.5
    done
    echo "The worker did not start. Last lines of $WORKER_LOG:" >&2
    tail -5 "$WORKER_LOG" >&2
    exit 1
    ;;
  stop)
    if pid="$(our_worker_pid)"; then
      kill "$pid"
      for _ in $(seq 1 50); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.2
      done
      echo "Stopped worker pid $pid"
    fi
    rm -f "$WORKER_PID_FILE"
    ;;
  status)
    if pid="$(our_worker_pid)"; then echo "OK    worker pid $pid"; else echo "FAIL  no worker; run worker.sh start replay"; exit 1; fi
    ;;
  *)
    echo "Usage: ESTA_SLOT=<n> worker.sh start replay|live | stop | status" >&2
    exit 2
    ;;
esac
