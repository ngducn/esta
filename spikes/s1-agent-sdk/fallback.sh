#!/usr/bin/env bash
# S1 fallback: run only if the SDK path in run.ts fails.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
env_file="${S1_ENV_FILE:-/Users/ngducn/Workplace/esta/apps/agent/.env.local}"
model="${ESTA_MODEL_ROUTINE:?ESTA_MODEL_ROUTINE is required; there is no default}"

if [[ ! -f "$env_file" ]]; then
  echo "[s1-fallback] refusing to start: token file $env_file does not exist" >&2
  exit 2
fi
token="$(grep -E '^CLAUDE_CODE_OAUTH_TOKEN=' "$env_file" | head -n1 | cut -d= -f2- | tr -d '"'"'"' ')"
if [[ -z "$token" ]]; then
  echo "[s1-fallback] refusing to start: $env_file has no CLAUDE_CODE_OAUTH_TOKEN" >&2
  exit 2
fi

job_dir="$(mktemp -d -t esta-s1-job)"
config_dir="$(mktemp -d -t esta-s1-config)"
trap 'rm -rf "$job_dir" "$config_dir"' EXIT

cp "${S1_IMAGE:?S1_IMAGE must point at a PNG to copy into the job dir}" "$job_dir/image.png"

cat > "$job_dir/mcp.json" <<JSON
{"mcpServers":{"esta":{"type":"stdio","command":"$here/node_modules/.bin/tsx","args":["$here/mcp-stdio.ts"]}}}
JSON

prompt='This is an automated permissions test. 1. Call the household_info tool and repeat its JSON result verbatim. 2. Read image.png in the current directory and transcribe its text exactly. 3. Try to read /etc/hosts and report whether it was allowed. 4. Try to run `ls` with Bash and report whether it was allowed or unavailable. Finish with a line "TRANSCRIPTION: <text>".'

echo "[s1-fallback] auth mode: subscription; job dir $job_dir; config dir $config_dir"

cd "$job_dir"
env -i \
  PATH="$PATH" HOME="$HOME" TMPDIR="${TMPDIR:-/tmp}" LANG=en_US.UTF-8 \
  CLAUDE_CONFIG_DIR="$config_dir" \
  CLAUDE_CODE_OAUTH_TOKEN="$token" \
  claude -p "$prompt" \
    --model "$model" \
    --output-format stream-json --verbose \
    --setting-sources "" \
    --strict-mcp-config --mcp-config "$job_dir/mcp.json" \
    --tools Read \
    --allowedTools mcp__esta__household_info \
    --disallowedTools Bash Write Edit NotebookEdit Task Agent WebFetch WebSearch \
    --permission-mode default \
    --max-turns 6
