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

- `hai bên` as both parties passes when the next word is an act of two contracting parties (`ký`, `thỏa thuận`, `thống nhất`, `đồng ý`, `cam kết`, `xác nhận`, `thương lượng`, `bàn bạc`, `cùng`, `đều`, `tự`) or the clause ends (`Hợp đồng giữa hai bên.`). The same holds after `giữa`, `của` and `cả`. `đã`, `không`, `sẽ`, `có`, `được`, `thuê`, `chủ` and the classifiers are not in the list, so `hai bên thuê` and `Cả hai bên thuê đã trả` count tenants and are rejected. Two whole phrases stay literal because live answers wrote them: `giữa hai bên có thỏa` and `cả hai bên có thể cùng`.
- `ba mẹ`, `ba và mẹ`, `mẹ và ba`, `ba hoặc mẹ`, `mẹ hoặc ba` as parents pass when a short set of verbs and particles follows (`vẫn`, `không`, `còn`, `muốn`, `đều`, `và`, `của`, `đứng`...) or the clause ends. Anything else, such as `căn`, `người` or `con`, is a count (`Ba mẹ ba mẹ.`, P5-12's reject, is rejected again).
- `cả hai` as both passes before `đều`, `cùng`, `đã`, `không`, `phải`, `có`, `sẽ`, `cũng`, `nên`, `thì` or at the end of its clause. `Cả hai chủ sở hữu` counts owners and is rejected.
- A context that `có` or `còn` stands before never passes: `Có hai bên ký` and `Còn hai bên phòng` count sides.
- `phần trăm` as a noun passes when no number word stands before `phần` (`một phần trăm`, `ba phần trăm` are rejected). `trăm` stays an amount anywhere else.

**Accepted trade (L4).** `cả hai` before a verb passes even when it restates a count the answer never named: "Hiện cả hai đều chưa vượt ngưỡng." says the same as the true reject `Hiện cả hai chủ sở hữu chưa vượt ngưỡng.` without its noun. No mechanical check can see whether the two were named earlier, so the trade is recorded here and in the review checklist (`verification-tiers.md`, item 8).

A legal article number and a law's year (digits in `Điều 118`, `Luật Nhà ở 2023`) did not appear in the 16 rejects, so no context for them was added: a digit is a figure the model typed, and the guard keeps rejecting it until a live answer shows a case. `thứ hai` (Monday or second) is a date word the guard rejects on purpose.

Checks: the 17 live sentences are fixed cases (`fixtures/live-rejects.ts`; the `vi-transfer-procedure` row is gone, since no committed file holds that prompt's live answer). The properties in `live-rejects.test.ts` write their contexts, counted nouns (`người`, `căn`, `phòng`, `con`, `chủ`, `thuê`, `cái`, `chiếc`, `mảnh`, `lô`...) and leading words (none, `Có`, `Còn`) in the test, apart from the table: a context passes among ordinary words, a counted noun after the whole of it is rejected with each leading word, `Có` or `Còn` before it is rejected, a number word before `phần trăm` is rejected, and a real number word beside a context is rejected. The first fix's property drew from a hand copy of the table, so it could not find the eight; `esta/no-self-sourced-property` now fails a property that draws from a `*.cases.ts` table the same file asserts equal to a production export.

P5-12's fixed set in `apps/agent/test/golden/open-prose.test.ts` loses `vi-repair-first` (its first pass now passes) and drops the `hai` line from the `vi-raise-rent` repair, through `rekey-ask.ts` (`DROPPED_REPAIR_LINES`). It gains the source rejects of `vi-bank-letter` and `vi-notarize-lease`. `vi-transfer-procedure` is again rejected for `Hai bên mang giấy tờ`, as P5-12 had it.
