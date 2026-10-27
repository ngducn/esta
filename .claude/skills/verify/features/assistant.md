# Trợ lý thread, status and connection check

`/assistant` (tab `Tin nhắn`) is one thread. Trợ lý's notes and the member's own messages and their answers read oldest at the top and newest at the bottom, with the reply box `Viết cho Trợ lý` after the newest entry. Under the `Trợ lý` title one line says whether the worker is online, from the newest row in `worker_heartbeats`. Operators (Ryan) run `Kiểm tra kết nối` (`Chạy kiểm tra`, one `ping` job) and `Chạy theo dõi` on `/assistant/diagnostics`, with the last 20 rows of `agent_runs` (`Lần chạy gần đây`), the worker's modes, held notes and 7-day usage. The account menu links it for operators only, and Mẹ gets the not-found page there.

## Sub-features

- Thread: 40 entries a page, `Xem tin cũ hơn` for the page before (`?before=<stamp>_<rank>_<id>`), and `?note=<id>` (the Home brief's link) opens 20 entries either side of that note with `Xem tin mới nhất` in place of the reply box. A hidden note, or a note whose work is done (a failed job run again, a document reviewed), stays in place as one muted line (`Đã ẩn: …` with `Hoàn tác`, or `Đã xử lý: …`).
- Reply box: `Gửi` sends; the answer streams into the card below her message. The box waits (`data-state="busy"`) while an answer streams and holds for tomorrow (`deferred`) once the day's cap is reached. Operators also see `Suy nghĩ kỹ hơn`. A new day's first message opens a new segment seeded from the last three answered turns.
- Old links: `/assistant/ask` and `/assistant/ask/<id>` redirect to `/assistant`; another household's conversation id is a 404.

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
$S/b.sh text                         # status line, the thread, Viết cho Trợ lý
$S/b.sh goto http://localhost:<web port>/assistant/diagnostics
$S/b.sh click 'role=button[name="Chạy kiểm tra"]'
$S/b.sh wait '[data-testid="ping-status"][data-status="done"]'
docker exec supabase_db_esta-$ESTA_SLOT psql -U postgres -tAc "select status, attempts, result->>'reply' from agent_jobs order by created_at desc limit 1"
$S/worker.sh stop
pnpm clock:set 2026-10-07T09:06:00+07:00   # six minutes later the line reads ngoại tuyến từ 09:00
```

- `worker.sh start live` runs the Claude Agent SDK on the operator's credential. It reads `CLAUDE_CODE_OAUTH_TOKEN` and `ESTA_MODEL_ROUTINE` from `apps/agent/.env.local` or the shell. Only the verifier lane's gate demo and `pnpm agent:record` run live; every other lane uses `replay`.
- Mẹ is `me.lane<n>@demo.esta.test`. Her page must show the status line, the thread and the reply box without `Suy nghĩ kỹ hơn`.
- A message only answers in replay when its prompt matches a recording, and an earlier segment changes the prompt. `freshThread` in `e2e/helpers/thread.ts` deletes a lane member's conversations first; by hand, run `delete from conversations where created_by = '<her uuid>'` in the slot's psql.
- `ESTA_REPLAY_DIR=<empty dir> $S/worker.sh start replay` makes every ping fail at once with `No replay recording for ping input <64 hex> ... Run pnpm agent:record to record it.`

## Gotchas

- The heartbeat time comes from the test clock, so a fresh `launch.sh` reads `09:00`. Moving the clock does not write a heartbeat; restart the worker to write one at the new time.
- One worker per slot. `worker.sh start` refuses a second, and `cleanup.sh` stops it.
- The seed gives every household one finished replay ping and its run, so `Lần chạy gần đây` on `/assistant/diagnostics` is never empty on a fresh reset.
- `pnpm e2e e2e/assistant-status.spec.ts` starts and stops its own replay worker; stop yours with `worker.sh stop` first, or the offline rule never sees the line go stale.
