set -euo pipefail

if [[ ! "${ESTA_SLOT:-}" =~ ^[1-9][0-9]?$ ]]; then
  echo "Set ESTA_SLOT to your lane's slot, 1 to 97. Slot 0 uses port 3000, which another app holds." >&2
  exit 2
fi
if [[ "$ESTA_SLOT" == 98 || "$ESTA_SLOT" == 99 ]]; then
  echo "Slots 98 and 99 belong to pnpm test:live. Pick another ESTA_SLOT." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
WEB_PORT=$((3000 + 100 * ESTA_SLOT))
API_PORT=$((54321 + 100 * ESTA_SLOT))
DB_PORT=$((54322 + 100 * ESTA_SLOT))
STUDIO_PORT=$((54323 + 100 * ESTA_SLOT))
INBUCKET_PORT=$((54324 + 100 * ESTA_SLOT))
WEB_URL="http://localhost:${WEB_PORT}"
DB_CONTAINER="supabase_db_esta-${ESTA_SLOT}"
RUN_DIR="/tmp/esta-verify/slot-${ESTA_SLOT}"
WEB_PID_FILE="${RUN_DIR}/web.pid"
STACK_MARKER="${RUN_DIR}/stack"
DEFAULT_CLOCK="2026-10-07T09:00:00+07:00"

export BROWSE_STATE_FILE="${BROWSE_STATE_FILE:-${RUN_DIR}/browse.json}"
export BROWSE_PORT="${BROWSE_PORT:-$((47000 + ESTA_SLOT))}"
B="${B:-$HOME/.claude/skills/gstack/browse/dist/browse}"

mkdir -p "$RUN_DIR" "$(dirname "$BROWSE_STATE_FILE")"

listener_pid() {
  { lsof -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; } | head -1
}

our_web_pid() {
  local pid
  pid="$(cat "$WEB_PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" && "$(ps -o command= -p "$pid" 2>/dev/null)" == *scripts/web.ts* ]] && echo "$pid"
}

started_by_us() {
  local pid="$1" ours
  ours="$(our_web_pid)" || return 1
  while [[ -n "$pid" && "$pid" != "1" && "$pid" != "0" ]]; do
    [[ "$pid" == "$ours" ]] && return 0
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  done
  return 1
}

stop_web() {
  local pid
  if pid="$(our_web_pid)"; then
    kill "$pid"
    for _ in $(seq 1 50); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.2
    done
    echo "Stopped web pid $pid"
  fi
  rm -f "$WEB_PID_FILE"
}

stack_running() {
  docker inspect -f '{{.State.Running}}' "$DB_CONTAINER" 2>/dev/null | grep -q true
}

# The stack serves auth settings and email templates from the checkout that started it, and
# `pnpm db:reset` reloads neither, so Launch compares this against the marker it wrote.
stack_fingerprint() {
  (
    cd "$REPO_ROOT"
    printf 'checkout=%s\nconfig=%s\n' "$REPO_ROOT" "$(shasum -a 256 supabase/config.toml supabase/templates/* | shasum -a 256 | cut -d' ' -f1)"
  )
}

marker_checkout() {
  sed -n 's/^checkout=//p' "$STACK_MARKER" 2>/dev/null || true
}

current_path() {
  "$B" url 2>/dev/null | sed -E 's#^https?://[^/]+##; s#[?\#].*$##'
}

# Opens an app page when the tab is not on this slot's origin, so cookies land on the right host.
ensure_on_app() {
  case "$("$B" url 2>/dev/null)" in
    "$WEB_URL"*) ;;
    *) "$B" goto "$WEB_URL/sign-in" >/dev/null ;;
  esac
}
