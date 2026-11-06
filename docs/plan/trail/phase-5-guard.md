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
| `vi-property-manager` | `trăm` | "theo phần trăm tiền thu được" | false, a noun |
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

## What changed in the guard

Three classes of false reject, each a list of the only contexts the word passes in (`passesInPhrases` on its row in `words.ts`), where a context names what may follow it and never what may not. The first fix (90ac12ce) let real counts through, because it listed what could not follow; the audit found eight (`Sổ của mẹ và ba căn hộ cho thuê`, `Cả hai bên thuê đã trả`, `Có hai bên đã đặt cọc giữ phòng`, `một phần trăm` and others). The fix round rewrote the table.

Fix round 2 (the reader found 15 more counts that still passed, such as "Đã có tổng cộng hai bên ký hợp đồng.", "Mẹ cho hai bên cùng thuê.", "Tổng số bên thuê là hai bên.") added the word **before** the context to the same table. A context now lists what may stand before it and what may follow it, and nothing else passes.

- `hai bên` as both parties passes only at a sentence start (the text start, after `.`, `!`, `?` or a line break, never after a comma, a colon or a quote mark) or right after `để`, `khi` or `nếu` (`Chỉ đổi giá khi hai bên cùng đồng ý`, a live answer), and only when an act of two contracting parties follows (`ký`, `thỏa thuận`, `thống nhất`, `đồng ý`, `cam kết`, `xác nhận`, `thương lượng`, `bàn bạc`, `cùng`, `đều`, `tự`). After `giữa` or `của`, with no counting word before them (`có`, `còn`, `thêm`, `tới`, `đến`, `được`, `chỉ`, `tổng`, `cộng`, `là`, `với`, `cho`, `từ`, `đã`), the same acts pass or the clause may end (`Hợp đồng giữa hai bên.`); after `cả` the clause ends only when `giữa` or `của` stands before it. `thuê`, `chủ`, `đã`, `không` and the classifiers are in no list, so `hai bên thuê`, `Tiền cọc của hai bên thuê đã nhận` and `Tổng số bên thuê là hai bên.` are rejected. Two whole phrases stay literal because live answers wrote them: `giữa hai bên có thỏa` and `cả hai bên có thể cùng`. `Giữa hai bên đã thỏa thuận.` is rejected (`đã` opens no listed act).
- `ba mẹ`, `ba và mẹ`, `mẹ và ba`, `ba hoặc mẹ`, `mẹ hoặc ba` as parents pass at a sentence start, after a colon (a bold label such as `**Lập di chúc:**` shows as one), or after `nhưng`, `vì`, `nếu`, `khi`, `để`, when a short set of verbs and particles follows (`vẫn`, `không`, `còn`, `muốn`, `đều`, `và`, `của`...); after `giữa`, `của` or `cả` the clause may also end (`tài sản của ba hoặc mẹ,`). Anything else, such as `căn`, `người` or `con` after, or `Chỉ ba mẹ vẫn` before, is a count (`Ba mẹ ba mẹ.`, P5-12's reject, is rejected again).
- `cả hai` as both passes at a sentence start, after a comma that no counting word stands before, or after `nhưng`, `vì`, `nếu`, `khi`, `để`, before `đều`, `cùng`, `đã`, `không`, `phải`, `có`, `sẽ`, `cũng`, `nên` or `thì`; after `của` or `giữa` the clause may end (`chung của cả hai.`). `Cả hai chủ sở hữu` counts owners and is rejected.
- `phần trăm` as a noun passes when no number word, `không` included, stands before `phần` (`một phần trăm`, `ba phần trăm`, `không phần trăm` are rejected). `trăm` stays an amount anywhere else.

**Accepted trade (L4), narrowed.** `cả hai` that follows a sentence start or `nhưng`, `vì`, `nếu`, `khi`, `để` still passes before a verb even when it restates a count the answer never named ("Nhưng cả hai đều chưa vượt ngưỡng."). Round 2 rejects "Hiện cả hai đều chưa vượt ngưỡng." (`Hiện` is in no list). No mechanical check can see whether the two were named earlier, so the trade is recorded here and in the review checklist (`verification-tiers.md`, item 8).

A legal article number and a law's year (digits in `Điều 118`, `Luật Nhà ở 2023`) did not appear in the 16 rejects, so no context for them was added: a digit is a figure the model typed, and the guard keeps rejecting it until a live answer shows a case. `thứ hai` (Monday or second) is a date word the guard rejects on purpose.

Checks: the 17 live sentences are fixed cases (`fixtures/live-rejects.ts`; the `vi-transfer-procedure` row is gone, since no committed file holds that prompt's live answer). The properties in `live-rejects.test.ts` write their contexts, counted nouns (`người`, `căn`, `phòng`, `con`, `chủ`, `thuê`, `cái`, `chiếc`, `mảnh`, `lô`...) and quantifiers (`thêm`, `tới`, `đến`, `được`, `chỉ`, `tổng cộng`, `là`, `với`, `cho`, `từ`, `có`, `còn`, and none) in the test, apart from the table: a context passes among ordinary words, a counted noun after the whole of it is rejected with each quantifier, a quantifier before it is rejected whether the context is then followed by the act that would pass it, by a comma and a noun, or quoted, a number word or `không` before `phần trăm` is rejected, and a real number word beside a context is rejected. The eleven sentences the reader found are fixed cases in `open-prose.test.ts`. The first fix's property drew from a hand copy of the table, so it could not find the eight; `esta/no-self-sourced-property` now fails a property that draws from a `*.cases.ts` table the same file asserts equal to a production export or checks as a subset of one (`expect(PROD.filter((t) => !listed.has(t))).toEqual([])`, `toHaveLength(0)`, `.every(...)`, `assert.deepEqual`). It reads one file at a time, so a table pinned by a test in another file is not caught.

P5-12's fixed set in `apps/agent/test/golden/open-prose.test.ts` loses `vi-repair-first` (its first pass now passes) and drops the `hai` line from the `vi-raise-rent` repair, through `rekey-ask.ts` (`DROPPED_REPAIR_LINES`). It gains the source rejects of `vi-bank-letter` and `vi-notarize-lease`. `vi-transfer-procedure` is again rejected for `Hai bên mang giấy tờ`, as P5-12 had it.

## Live measurement after the fix round (P5-10d)

One live run on slot 14's `full` seed at 2026-10-07 07:00 +07, `claude-sonnet-5-5`, subscription auth. The probe's recordings were discarded, not kept as the replay set.

| Run | First pass rejected | False among them | Repair rejected | In `error` | Source |
| --- | --- | --- | --- | --- | --- |
| P5-12 | 8 | 1 | 0 | 0 | `p5-12-guard-probe.md` |
| Phase 5 live run | 13 of 26 | 3 prompts (`vi-notarize-lease`, `vi-property-manager`, `vi-inheritance`) | 3 | 0 | `phase-5/guard-probe.json` |
| After this fix round | 11 of 25 | 2 | 0 | 0 | `phase-5/guard-probe-p5-10d.json` |
| Fix round 2, replayed offline (no live call) | 10 of 27 replayed prompts, the same texts as before | not classified again | 0 | 0 | `phase-5/guard-probe-p5-10d.json` (`rescoredOffline`), `apps/agent/test/golden/open-prose.test.ts` |

Two of the 27 prompts were not probed: their recordings were refused for a 12-digit run (below). The 11 first-pass rejects: 5 typed figures (`vi-rent-by-year` `Q7` and `1`, `vi-choose-tenant` "hai phòng" and "hai ứng viên", `vi-inheritance` "Có hai cách", `en-rent-by-year` `Q7:`, `vi-savings-rate` `10` and `12`), 1 placeholder the sheet does not hold (`en-second-opinion`), 3 sent back for an official page, not the number guard (`vi-bank-letter`, `vi-notarize-lease`, `vi-red-pink-book`), and **2 false rejects the fix round did not remove**:

- `vi-end-lease-letter`: "sau khi hai bên kiểm tra phòng" (both parties inspect). `kiểm` is not in the acts of two parties, so `hai` is rejected; adding it would be tuning to this probe and needs a second live run, so the list is unchanged. Decision for Ryan.
- `vi-raise-rent`: "không tăng đồng loạt" ("all at once"). `đồng` is a currency word, outside the contexts of this PR; filed as a `[low]` issue.

Every reject now names its text (the three source rejects print `official source`).

**q5.** Passed live once: the answer states 386.899.628 ₫ and 482.658.469 ₫, 15.2 s, one run costing 0.0196 USD (`phase-5-p5-10d/table-rerun.md`, `phase-5-p5-10d/runs.json`, `phase-5-p5-10d/ask.json`). The live run's failure kept no answer text, so which words the guard rejected then is not known; this answer holds none of the three classes. Not classified further.

**The ID capture (SPEC D11).** `vi-transfer-procedure` and `vi-rent-tax` were refused, each by a 12-digit run in the `toolCalls` field, last four digits 3920 and 5786. The masked context is a news-article URL the model passed to a web tool: `.../sang-ten-so-do-nam-############-article.html` and `...ue-cho-thue-tai-san-############.html`. The digits are in neither the question nor a tool result the probe read: they are article numbers from the model's own web search. No seed or tool source holds them, so D11 is not broken, but the guard's ID reducer treats a URL's article number as a national ID and refuses the recording. Decision for Ryan: leave it (those two prompts stay unprobed live) or make the reducer skip digits inside a URL.
