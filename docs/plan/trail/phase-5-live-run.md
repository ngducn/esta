# Phase 5 live run (P5-10b)

Every job kind ran once live on slot 8's `full` seed with the clock frozen at 2026-10-07 07:00 +07 (the weekly review at Sunday 2026-10-11), on `claude-sonnet-5-5` with the subscription token, by `pnpm agent:live-run --mode live` (2026-11-06). The weekly review needed one re-run (below). Raw rows: `phase-5/table.md` (first run) and `phase-5/table-rerun.md`; outputs in `phase-5/`. The data is synthetic Demo data.

**Result: the live run does not pass.** 3 of 10 golden questions or thread cases failed, the guard probe rejected 3 repairs, and golden question 1 gave a wrong figure. Nothing was tuned in this PR; each failure is below as a finding.

## Pass table

| Section | Bar | Result |
| --- | --- | --- |
| Watch facts (§7.1) | exactly the 8 golden facts | pass, 8 matched, none missing, none extra |
| Brief (§7.3) | at most 300 words, links resolve, sections in order, no placeholder | pass, 212 words, 8 links, Cần làm > Theo dõi > Thị trường |
| Golden questions q1 to q10 (§7.4) | 10 of 10 | 8 of 10. q1 fail, q5 fail |
| Thread cases T1 to T8 (§7.4) | 8 of 8 | 7 of 8. T2 fail. T5, T6, T7, T8 pass |
| Research (§7.5) | item or empty item, every source URL 200 | pass, 1 item, its URL returned 200 (daibieunhandan.vn) |
| Extraction (§7.2) | schema-valid 100%, required exact 90%, high-confidence 97% | pass, 100.0%, 99.1%, 99.7% over 16 fixtures |
| Weekly review | job done, one note | pass on the re-run (see Deviations) |
| Guard probe | no false reject, no row in `error` | fail. 26 of 27 prompts probed, 13 first pass rejected, 3 repairs rejected (`vi-bank-letter`, `vi-notarize-lease`, `vi-red-pink-book`), 0 in `error`. P5-12 ended at 27 prompts, 8 first pass rejected, 1 false reject, 0 repair rejected, 0 in `error` |
| Timeouts (AGENT.md §3) | no job over its timeout | pass |
| Auth mode | every run `subscription` and `live` | pass |

## Cost and time

- Total `total_cost_usd`: 1.4651 over 22 runs in `agent_runs` (`phase-5/runs.json`, `phase-5/table-rerun.md`), plus 0.7055 for the extraction eval (`phase-5/extraction.json`), 2.17 in all. The guard probe does not report a cost, so it is not counted.
- What the times measure. In `phase-5/table.md` the first number is the seconds from sending the question to an answer whose status is no longer `streaming`. "First text at" is the seconds until the answer row first held any text. The script reads the row about once a second, so every time is rounded up to a whole poll (about 1 s), and the two columns differ by 1 s or less in most rows. The worker writes the answer once, when it is complete, so for a database reader first text and the whole answer arrive together; the 7 s gaps in T5 and T8 show a few turns wrote text before they finished. A streamed first sentence in the web app was not measured here.
- Ask turns: over the 15 turns that passed their checks and print a time, the average is 15.8 s and the longest is T7 (web) at 30.5 s against 45 s, within its rule (`phase-5/table.md`, `phase-5/live-run.log`).
- Golden question 1 failed its check, and the failing row prints no time, so its time against the 10 s rule [app rule] was not recorded and is not judged here. An earlier draft quoted 17.7 s from the console; no committed file holds it.
- Wall time per job kind is not recorded: the frozen clock makes `agent_runs` timestamps read 0 (`phase-5/runs.json`). The `usage` row "no job past its AGENT.md §3 timeout" passes (`phase-5/table-rerun.md`).
- Extraction wall time: 239.9 s in all, 21.1 s the longest (`phase-5/extraction.json`).

## Findings (golden rows that failed)

- **q1** `Tháng này thu được bao nhiêu từ Dĩ An?`. §7.4 expects 1.000.000 ₫ received in October. The ground truth in `ask-ground-truth.json` is 1000000. The log row says only `missing 1.000.000 ₫` (`phase-5/live-run.log`); the answer text was read on the console and not kept, because `ask.json` was overwritten (see Deviations), so the "0 ₫" reading is the owner's and is not in a committed file. For root: either the ledger read the model got excludes that receipt or the model misread it.
- **q5** `Doanh thu cho thuê năm nay của mẹ ...`. The answer ended in `error`: the job failed with `number_guard: the answer still held text the number guard rejects after its repair turn`. Expected 386.899.628 ₫ and 482.658.469 ₫. The guard rejected both the first pass and the repair.
- **T2** `Có nên cho thuê theo năm thay vì theo tháng không?`. §7.4 expects advice with no number. The answer was sound advice, then added `Theo dữ liệu hiện có` with dates, day counts (`còn 25 ngày`) and late-payment counts (`9 trên 10 kỳ`). It passed the guard because every figure came from tools, but it breaks the "no number" check.
- **Guard probe.** Three repairs were rejected again. Two list `hai` as the rejected word (likely `hai bên`, the compound P5-12 accepted as a trade) and one lists no text. The 27th prompt, `vi-transfer-procedure`, wrote a recording the repo's national-ID check refused to store, so it was not probed and the set is 26. This is not yet explained: the check reads only a recording's tool calls and reply, never its `inputHash` (a test with a 12-digit run in the hash passes on today's code), and the refused recording was not kept, so what matched is unknown. It runs again in the guard follow-up (P5-10d), which keeps the matched text. I did not classify each reject as true or false beyond this.

## Brief notice and approval audit

- The 2026-10-07 brief notice in the slot's Mailpit shows correct Vietnamese (`Trợ lý: Ghi chú buổi sáng 07/10/2026`, one sentence from the note, a `Mở tin nhắn` button) and its link opens the thread at that brief on a phone (`e2e/email-notice.spec.ts`, 3 of 3).
- One inline approval wrote an `audit_log` row for the new task and one for the decision on the note, both `actor_kind = 'user'` with the approving user's id (`e2e/assistant-proposals.spec.ts`, 4 of 4).
- Screenshots at 390 x 844 are in the PR body.

## Replay recordings

- The probe wrote new recordings for 26 prompts. With them in place `ESTA_AGENT_MODE=replay pnpm --filter agent test` failed 11 tests in `open-prose.test.ts`, because the live model rejects different words on the first pass than the committed run did. Changing those expectations would change a golden expectation to match a failing live run, so the probe's recordings were not kept and the committed recordings are unchanged. Replay stays 726 of 726.
- The hand-written northstar recordings have no live counterpart from this run: they are keyed to the `northstar` seed at 2026-10-08, and `agent:live-run` runs the `full` seed at 2026-10-07 and does not record. Replacing them needs a recording mode on the live worker or a northstar live run; it is left for root.

## Deviations

- Run needed `ESTA_ENV=development`, `ESTA_MODEL_ROUTINE=claude-sonnet-5-5` and (for the weekly review) `ESTA_MODEL_DEEP=claude-sonnet-5-5` set on the command line. The weekly review asks for the deep model, so it failed on the first run with `ESTA_MODEL_DEEP is not set`. The re-run used Sonnet for the deep model, not a larger model.
- The first run's `usage` rows failed because the seeded `ping` run (replay, no auth) was counted; the script now leaves `ping` out. The re-run, which re-reads all runs, passes them.
- The weekly re-run overwrote `phase-5/ask.json` with an empty file before the script was fixed to skip an empty save. The golden answers are therefore not kept as text; the table above and the first-run log (`phase-5/live-run.log`, committed) hold the results, as pass or fail rows without the answer text.
