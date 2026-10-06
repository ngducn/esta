# Sourced by every verify script. Derives one lane's ports, run directory and browser from ESTA_SLOT.
set -euo pipefail

if [[ ! "${ESTA_SLOT:-}" =~ ^[1-9][0-9]?$ ]]; then
  echo "Set ESTA_SLOT to your lane's slot, 1 to 99. Slot 0 uses port 3000, which another app holds." >&2
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
DEFAULT_CLOCK="2026-10-07T09:00:00+07:00"

export BROWSE_STATE_FILE="${BROWSE_STATE_FILE:-${RUN_DIR}/browse.json}"
export BROWSE_PORT="${BROWSE_PORT:-$((47000 + ESTA_SLOT))}"
B="${B:-$HOME/.claude/skills/gstack/browse/dist/browse}"

mkdir -p "$RUN_DIR" "$(dirname "$BROWSE_STATE_FILE")"

listener_pid() {
  { lsof -t -iTCP:"$1" -sTCP:LISTEN 2>/dev/null || true; } | head -1
}

# True when pid $1 is the recorded web.ts process or one of its descendants.
started_by_us() {
  local pid="$1" ours
  ours="$(cat "$WEB_PID_FILE" 2>/dev/null || true)"
  [[ -n "$ours" ]] || return 1
  while [[ -n "$pid" && "$pid" != "1" && "$pid" != "0" ]]; do
    [[ "$pid" == "$ours" ]] && return 0
    pid="$(ps -o ppid= -p "$pid" 2>/dev/null | tr -d ' ')"
  done
  return 1
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
