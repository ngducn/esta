# The number guard after the Phase 5 live run (P5-10d)

The live run (`phase-5-live-run.md`, PR #458) found the guard rejecting 13 of 26 first answers in the open-prose probe and 3 repairs, and golden question q5 ending in `number_guard`. This note classifies each reject and records what changed. The data is synthetic Demo data.

## What was classified

The probe's recordings of the live run (44 turns, not committed) were read back through today's guard. `phase-5/guard-probe.json` holds only the rejected word per prompt. A reject is **true** when the answer states a count or a number the model typed itself, and **false** when the word states no figure (`ba mẹ` for parents, `cả hai bên` for both parties, `phần trăm` as a noun).

## The 13 first-pass rejects

| Probe | Rejected | Sentence | Kind |
| --- | --- | --- | --- |
| `en-notarized-lease` | `three` | "confirms three things" | true, a count |
| `vi-bank-letter` | none named | the first answer lacked an official page, so the source repair ran | not the number guard (below) |
| `vi-choose-tenant` | `hai` | "hồ sơ của hai người" | true, a count |
| `vi-end-lease-letter` | `hai` | "để trống hai chỗ" | true, a count |
| `vi-inheritance` | `hai`, `Ba`, `ba` | "Có hai cách" is a count; "Ba mẹ vẫn giữ quyền", "ba hoặc mẹ" and "chung của cả hai." are parents and both | `hai` true, `Ba` and `ba` false |
| `vi-late-tenant` | `5` | "Khách phòng 5" | true, the room number from the question |
| `vi-notarize-lease` | `hai` | "cả hai bên có thể cùng đi công chứng" | false, both parties |
| `vi-property-manager` | `trăm` | "theo phần trăm tiền thu được" | false in round 1; a reject since fix round 4, steered |
| `vi-raise-rent` | `Q7:` | "[Nhà phố Q7](f6)" | true, a name the model typed |
| `vi-red-pink-book` | `hai` | "hai tên gọi", "hai loại" | true, a count |
| `vi-rent-tax` | `hai` | "cả hai chủ sở hữu" | true, a count of owners |
| `vi-zalo-reminder` | `5:` | "khách phòng 5:" | true, the room number from the question |
| `vi-zalo-welcome` | `2` | "Phòng 2 thuộc" | true, the room number from the question |

In all, 9 prompts were rejected only for true figures, 2 only for false ones (`vi-notarize-lease`, `vi-property-manager`), 1 for both (`vi-inheritance`) and 1 was not a number reject at all (`vi-bank-letter`).

## The 3 repair rejects

The row's "repair rejected" means the second turn was itself sent back. None of the three ended in `error`; each passed on a third turn.

| Probe | The second turn was sent back for | Kind |
| --- | --- | --- |
| `vi-bank-letter` | "Tôi đã đọc hai trang chính thức" | true, a count |
| `vi-notarize-lease` | no official page, so the source repair ran | not the number guard |
| `vi-red-pink-book` | no official page, so the source repair ran | not the number guard |

## The reject with no rejected text

`vi-bank-letter` was rejected on its first answer and the probe printed no text. The cause is not the number guard: a question about law, tax or procedure whose answer lacks an official page is sent back by the source check (AGENT.md §5.6 step 9), and that repair message, `askSourceRepairPrompt`, holds no `"<text>": <rule>` line. The probe read the repair message for quoted texts, found none and printed `[]`. A second gap sits beside it: a text with quotation marks in it (a number written `"5"`) did not match the probe's reader either.

Fixed by one reader, `repairTexts` in `packages/core/src/guard`, which matches each line by its rule's hint, and `rejectedTexts` in `apps/agent/src/prompts/ask.ts`, which names the missing official page (`official source`) for the source repair. The probe prints what the repair turn was rejected for too (`repairRejectedBy`), and the `number_guard` error names the rejected texts, so an operator reads them in the failed run.

## What changed in the guard, and the decision of fix round 3

The first fix (90ac12ce) taught the guard that `hai bên` (both parties), `ba mẹ` (parents) and `cả hai` (both) state no figure, by listing the contexts where each passes. Three reviewers in a row then found real counts the list let through: the audit found eight (`Sổ của mẹ và ba căn hộ cho thuê`, `Cả hai bên thuê đã trả`, `Có hai bên đã đặt cọc giữ phòng`, `một phần trăm`...), the round 1 reader found 15 more ("Đã có tổng cộng hai bên ký hợp đồng.", "Tổng số bên thuê là hai bên."), and the round 2 reader found 74 of 106 new sentences passing, through a line break, a `…`, a list item or table row, and `đều`, `cùng` or `tự` after any plural subject. Recognising Vietnamese idioms is an open-ended space that keeps leaking, and the guard decides whether Mẹ sees a figure that was never in her data: a false accept is a wrong number in front of her, a false reject costs a repair turn.

**Decision (root, fix round 3).** The guard stops recognising idioms. Each number word in `hai bên`, `ba mẹ`, `ba và mẹ`, `ba hoặc mẹ`, `mẹ và ba`, `mẹ hoặc ba`, `cả hai` and `cả hai bên` is judged exactly as before this PR. The tables of leads and followers, the phrase reader and `passesInPhrases` are deleted. The model is steered instead: rule 4 of the ask prompt says to use a number word only for a figure from a tool field, and to write `bố mẹ` (not `ba mẹ`), `bên thuê và bên cho thuê` or `người thuê và chủ nhà` (not `hai bên`), `cả người thuê lẫn chủ nhà` (not `cả hai`); and the repair turn names the exact rejected words and asks for the answer again without them (`repairTail`).

Fix round 4 (reader of round 3) removed the `phần trăm` noun pass too: it looked only two tokens back, so `một<br>phần trăm`, `một <i>phần trăm</i>` and `một x phần trăm` passed. `trăm` is judged as on main, `theo phần trăm tiền thu` included (a reject, the model is steered away from it). `words-never-looser.test.ts` lists main's table words and fails if one stops being judged. What stays of the PR because it only rejects more or only reports: every send-back names its text (`repairTexts`, `rejectedTexts`, the `number_guard` error); the source repair prints `official source`.

Checks: `reviewer-rejects.test.ts` reads `fixtures/reviewer-rejects.ts`, every sentence of the three reviewers and of the audit (synthetic), and fails unless the guard rejects each. `live-rejects.test.ts` holds the live sentences (a true reject is rejected, a `steered` one is rejected on purpose, the `phần trăm` one is `steered`) and properties that `trăm` is rejected after any word, across a soft break, a paragraph break, a hyphen and a bracket. `esta/no-self-sourced-property` now also catches the hoisted subset check (`const missing = LIST.filter((t) => !CASES.includes(t)); expect(missing).toEqual([])`); the `for…of` and `it.each` forms are issue #485. The ask-prompt tests check that each suggested replacement holds no number word and that the repair names the words.

**Accepted trade removed.** Round 1 recorded that `cả hai` before a verb passes when it restates an unnamed count. With no idiom left, `Hiện cả hai đều chưa vượt ngưỡng.` is rejected, and checklist item 8 in `verification-tiers.md` is gone.

A legal article number and a law's year (digits in `Điều 118`, `Luật Nhà ở 2023`) did not appear in the 16 rejects, so no context for them was added. `thứ hai` (Monday or second) is a date word the guard rejects on purpose.

P5-12's fixed replay set (`apps/agent/test/golden/open-prose.test.ts`) is as before the PR, plus the source rejects of `vi-bank-letter` and `vi-notarize-lease`; the recordings are re-keyed only by `rekey-ask.ts`, which now also gives a recorded repair turn the current closing line (`withCurrentRepairTail`) and walks the case folders beside the main set.

## Live measurement (P5-10d)

Two live runs on the synthetic `full` seed at 2026-10-07 07:00 +07, `claude-sonnet-5-5`, subscription auth. The probe's recordings were discarded, not kept as the replay set.

| Run | First pass rejected | False among them | Repair rejected | In `error` | Source |
| --- | --- | --- | --- | --- | --- |
| P5-12 | 8 | 1 | 0 | 0 | `p5-12-guard-probe.md` |
| Phase 5 live run | 13 of 26 | 3 prompts | 3 | 0 | `phase-5/guard-probe.json` |
| Fix round 1 (idiom tables) | 11 of 25 | 2 | 0 by the number guard; 2 sent back for an official page | 0 | `phase-5/guard-probe-p5-10d.json` |
| Fix round 3 (no idioms, prompt rule) | 12 of 27 | 2 prompts | 3: 2 for an official page, 1 by the number guard | 0 | `phase-5/guard-probe-p5-10d-ff3.json` |
| #496 (no phrase table; `số một` and `bên thứ ba` steered) | 11 of 26 | at least 4 of 26 (5 with `vi-red-pink-book`) | 2 (`Hai` after the official-page turn) | 0 | live run on slot 9, counts only |

Round 3's 12 first-pass rejects: 8 typed figures (`vi-choose-tenant` "hai người xin thuê", `vi-zalo-welcome` and `vi-late-tenant` room numbers from the question, `vi-end-lease-letter` "Phòng 2" and "hai ngày", `vi-inheritance` "Có hai cách", `vi-deposit` "hai chữ ký", `vi-raise-rent` `Q7` and `Quận 1`, `vi-savings-rate` a date, counted by prompt), 2 sent back for an official page, not the number guard (`vi-bank-letter`, `vi-notarize-lease`), and **2 false rejects**: `vi-transfer-procedure` "Hai bên mang theo sổ gốc" (both parties) and `vi-red-pink-book` "cả hai" (both forms); `vi-choose-tenant` also wrote "cả hai đều" beside its true count. The 3 repair rejects: `vi-transfer-procedure` and `vi-red-pink-book` for an official page, `vi-notarize-lease` for `403)`, an HTTP code the model typed (true). The probe's `repairRejected` counts all three; none ended in `error`. Round 2's reader showed `rescoredOffline` reporting 0 where this definition gives 2; the figure in the table above is the probe's own.

#496 live run (2026-11-06, slot 9, `claude-sonnet-5-5`, once): 26 prompts probed. `vi-red-pink-book`'s first pass and repair turn were re-recorded in this run (its first pass rejected  below); only its hand-written source-repair turn is older, because the probe refused the third turn, whose recording held an ID-like number. First pass rejected for 11: 3 typed figures or counts (`hai` in `vi-choose-tenant` and `vi-inheritance`, the room number `5` in `vi-late-tenant`; the `hai` counts were not split into true counts and `hai bên`), 3 sent back for an official page (`vi-bank-letter`, `vi-transfer-procedure`, `vi-notarize-lease`), and **at least 4 false rejects, 5 counting `vi-red-pink-book`**: `vi-zalo-price-change` wrote `hai bên` ("để hai bên thống nhất", the class #471 counted), `vi-red-pink-book` wrote `cả hai loại` (both kinds), `vi-raise-rent` wrote `đồng loạt`, `vi-property-manager` wrote `phần trăm`, and `vi-electrician` wrote a link whose text repeats its target (no steer; filed as #509). `vi-insurance` passed (the earlier run's `bên thứ ba` is gone) and no answer held `số một`. Repair rejected 2 (`Hai` after the official-page turn in `vi-bank-letter` and `vi-notarize-lease`); no row in error. The guard is not loosened: the style rule now also says `cùng lúc`, never `đồng loạt`, and `theo tỷ lệ`, never `phần trăm`, each checked against the guard in `ask-repair.test.ts`; that steer has not been run live. The probe's recordings are now the open-prose replay set (re-keyed only by `rekey-ask.ts`).

**Pass bar not met.** "No false reject in the set and no row in error": no row is in error, and 2 prompts still hold a false reject because the model wrote `hai bên` and `cả hai` despite the style rule. They cost one repair turn each. The guard is not loosened to meet the bar; the next lever is the prompt (a stronger rule or a worked example), judged by another live run. Recorded in `STATUS.md`.

Fix round 4 re-scored round 3's probe offline (`phase-5/guard-probe-p5-10d-ff3.json` holds rejected words, no answer text, and none is `trăm`): first-pass 12 and repair 3 are unchanged, since the `phần trăm` change only touches `vi-property-manager`, which is in the Phase 5 live run's count, not round 3's.

The probe printed no `--out` file; the JSON was written from its stdout line per prompt, with the kind of each reject added by hand.

**q5.** Passed live once: the answer states 386.899.628 ₫ and 482.658.469 ₫, 15.2 s, one run costing 0.0196 USD (`phase-5-p5-10d/table-rerun.md`, `phase-5-p5-10d/runs.json`, `phase-5-p5-10d/ask.json`). The live run's failure kept no answer text, so which words the guard rejected then is not known; this answer holds none of the three classes. Not classified further.

**The ID capture (SPEC D11).** `vi-transfer-procedure` and `vi-rent-tax` were refused, each by a 12-digit run in the `toolCalls` field, last four digits 3920 and 5786. The masked context is a news-article URL the model passed to a web tool: `.../sang-ten-so-do-nam-############-article.html` and `...ue-cho-thue-tai-san-############.html`. The digits are in neither the question nor a tool result the probe read: they are article numbers from the model's own web search. No seed or tool source holds them, so D11 is not broken, but the guard's ID reducer treats a URL's article number as a national ID and refuses the recording. Decision for Ryan: leave it (those two prompts stay unprobed live) or make the reducer skip digits inside a URL.
