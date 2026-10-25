# Trợ lý status and connection check

`/assistant` shows every member one line under the `Trợ lý` title that says whether the worker is online, from the newest row in `worker_heartbeats`. Operators (Ryan) also see `Kiểm tra kết nối`, whose `Chạy kiểm tra` button queues one `ping` job. The last 20 rows of `agent_runs` (`Lần chạy gần đây`), the worker's modes, held notes and 7-day usage live on `/assistant/diagnostics`, which the account menu links for operators only. Mẹ's `/assistant` carries none of it, and `/assistant/diagnostics` shows her the not-found page.

## Sub-features

- Status line: `Trợ lý đang hoạt động. Cập nhật lúc 09:00.` when the heartbeat is at most 5 minutes old, `Trợ lý ngoại tuyến từ 09:00. Việc mới sẽ chạy khi máy hoạt động lại.` after that, and `Trợ lý chưa kết nối. Việc mới sẽ chạy khi máy hoạt động lại.` with no heartbeat. A heartbeat on an earlier day adds the date, as in `từ 21:30 06/10/2026`.
- Connection check (operators): the newest ping with `Đang chờ`, `Đang chạy`, `Xong` or `Lỗi`, its reply or its error, and the page refreshing every 2 s while the ping is queued or running.
- Recent runs (operators): time, auth mode, agent mode, model, turns, estimated cost and tool calls, newest first.

## How to get to it (user POV)

Sign in, then tap `Trợ lý` in the tab bar (phone) or the sidebar (desktop).

## Driving it with the verify skill

```bash
$S/launch.sh                         # a fresh reset seeds no heartbeat, so the line reads "chưa kết nối"
$S/worker.sh start replay            # replay worker on this slot; pid in /tmp/esta-verify/slot-<n>/worker.pid
$S/sign-in.sh ryan.lane4@demo.esta.test
$S/b.sh goto http://localhost:<web port>/assistant
$S/b.sh text                         # status line, Kiểm tra kết nối
$S/b.sh click 'role=button[name="Chạy kiểm tra"]'
$S/b.sh wait '[data-testid="ping-status"][data-status="done"]'
docker exec supabase_db_esta-$ESTA_SLOT psql -U postgres -tAc "select status, attempts, result->>'reply' from agent_jobs order by created_at desc limit 1"
$S/worker.sh stop
pnpm clock:set 2026-10-07T09:06:00+07:00   # six minutes later the line reads ngoại tuyến từ 09:00
```

- `worker.sh start live` runs the Claude Agent SDK on the operator's credential. It reads `CLAUDE_CODE_OAUTH_TOKEN` and `ESTA_MODEL_ROUTINE` from `apps/agent/.env.local` or the shell. Only the verifier lane's gate demo and `pnpm agent:record` run live; every other lane uses `replay`.
- Mẹ is `me.lane<n>@demo.esta.test`. Her page must show the status line and no `Kiểm tra kết nối`.
- `ESTA_REPLAY_DIR=<empty dir> $S/worker.sh start replay` makes every ping fail at once with `No replay recording for ping input <64 hex> ... Run pnpm agent:record to record it.`

## Gotchas

- The heartbeat time comes from the test clock, so a fresh `launch.sh` reads `09:00`. Moving the clock does not write a heartbeat; restart the worker to write one at the new time.
- One worker per slot. `worker.sh start` refuses a second, and `cleanup.sh` stops it.
- The seed gives every household one finished replay ping and its run, so `Lần chạy gần đây` on `/assistant/diagnostics` is never empty on a fresh reset.
- `pnpm e2e e2e/assistant-status.spec.ts` starts and stops its own replay worker; stop yours with `worker.sh stop` first, or the offline rule never sees the line go stale.
