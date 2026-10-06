# Spike S1. Claude Agent SDK on the subscription token

Question (SPEC §11 S1). Does the Claude Agent SDK run in a Node TypeScript process on Ryan's subscription token, with an in-process MCP tool, isolated settings, denied tools, and Read on a temp-dir image?

Answer. Yes. The SDK path works, and the `claude -p` fallback is not needed. The tool gate described in AGENT.md §2.2 leaks, and a `PreToolUse` hook closes the leak.

## What was built

- `run.ts` has three modes (`live`, `no-credential`, `mock`) and `S1_READ_GATE=allowlist|callback|hook`. It loads the token only from `S1_ENV_FILE` (default `apps/agent/.env.local`), passes only `CLAUDE_CODE_OAUTH_TOKEN` in `env`, and points `CLAUDE_CONFIG_DIR` at an empty temp dir. It registers `createSdkMcpServer({ name: 'esta' })` with `household_info`, writes a synthetic PNG into a temp job dir, and sets `cwd` to it.
- `mock-api.ts` is a scripted streaming Messages API for gate tests without a model.
- `fallback.sh` and `mcp-stdio.ts` are the `claude -p --output-format stream-json` fallback. They were not run because the SDK path passed.
- SDK version 0.3.291. Model `ESTA_MODEL_ROUTINE=claude-sonnet-5-5`.

## Results

| Case | Command | Outcome | Capture |
| --- | --- | --- | --- |
| Positive, hook gate | `S1_READ_GATE=hook npx tsx run.ts` | `apiKeySource=none`, `household_info` returned the stub, the image transcription matched exactly, `/etc/hosts` denied, Bash unavailable. `num_turns=4`, `total_cost_usd=0.0144` | `out/live-hook.txt` |
| Positive, allowlist gate | `S1_READ_GATE=allowlist npx tsx run.ts` | The model read `/etc/hosts`. `canUseTool` was never called | `out/live-allowlist.txt` |
| No token file | `S1_ENV_FILE=/nonexistent npx tsx run.ts` | Exit 2 with a `claude setup-token` hint | in the run log |
| Bogus token plus decoy `ANTHROPIC_API_KEY` | `S1_ENV_FILE=<bogus.env> ANTHROPIC_API_KEY=decoy npx tsx run.ts` | `401 OAuth access token is invalid`. No ambient credential used | `out/neg-b.txt` |
| No credential on a logged-in machine | `npx tsx run.ts no-credential` | `Not logged in`. The empty `CLAUDE_CONFIG_DIR` hides the keychain login | `out/neg-c.txt` |
| Gate comparison on the mock API | `S1_READ_GATE=<gate> npx tsx run.ts mock` | allowlist reads outside the job dir, callback denies, hook denies and sees every call | `out/mock-*.txt` |

## Corrections to AGENT.md §2.2

1. A bare tool name in `allowedTools` auto-approves that tool before `canUseTool` runs. The SDK prints `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED`. Enforce the job's path policy in a `PreToolUse` hook instead.
2. `disallowedTools` leaves Glob, Grep, Skill, ToolSearch, Workflow, SendMessage, the Cron tools and EnterWorktree available. Set `tools` per job kind. `tools: ['Read']` cut the list to `[Read, mcp__esta__household_info]`. `ping` takes `tools: []`.
3. Set `permissionMode: 'default'` explicitly, `strictMcpConfig: true`, and `alwaysLoad: true` on the MCP server.
4. `env` replaces the subprocess environment. Include `CLAUDE_CONFIG_DIR` pointing at an empty per-worker dir.
5. Auth failures return `subtype: 'success'` with `is_error: true`. The worker checks `is_error`.

Confirmed option names. `query`, `createSdkMcpServer({ name, version, tools, alwaysLoad })`, `tool(name, description, zodRawShape, handler)`, `settingSources`, `tools`, `allowedTools`, `disallowedTools`, `canUseTool`, `hooks.PreToolUse`, `permissionMode`, `strictMcpConfig`, `env`, `cwd`, `model`, `maxTurns`, `abortController`, `stderr`. Result fields `num_turns`, `session_id`, `total_cost_usd`, `usage`, `modelUsage`, `permission_denials`.

## Open items

- Token expiry is unknown. The worker surfaces a 401 to operators as an auth error.
- `fallback.sh` passes `bash -n` only. Confirm `--max-turns` before relying on it.

## Decision

Use the SDK. Gate tools with `tools` per job kind plus a `PreToolUse` hook. AGENT.md §2.2 changes in P0-15.
