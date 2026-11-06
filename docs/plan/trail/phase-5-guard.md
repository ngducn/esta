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

Three classes of false reject, each a context list on the word's row in `words.ts` (`passesInPhrases`), not a list of the words seen:

- `hai bên` as both parties: after `giữa`, `của` or `cả`, or before what two parties do together (`cùng`, `đều`, `đồng ý`, `ký`, `phải`, and so on). `Có hai bên thuê.` and `Hai bên thuê chưa từng trả trễ.` still count tenants and are rejected.
- `ba mẹ`, `ba hoặc mẹ`, `ba và mẹ` as parents, unless `con` follows (`Ba mẹ con chị Hoa` is a family of three). `cả hai` as both when it ends its clause or a verb follows (`đều`, `cùng`, `đã`, `không`). `Cả hai chủ sở hữu` counts owners and is rejected.
- `phần trăm` as a noun. `trăm` stays an amount anywhere else, and a number word beside `phần trăm` is rejected on its own.

A legal article number and a law's year (digits in `Điều 118`, `Luật Nhà ở 2023`) did not appear in the 16 rejects, so no context for them was added: a digit is a figure the model typed, and the guard keeps rejecting it until a live answer shows a case. `thứ hai` (Monday or second) is a date word the guard rejects on purpose.

Checks: the 18 live sentences are fixed cases (`fixtures/live-rejects.ts`), and a fast-check property draws each listed context among ordinary words (passes), puts a counted noun after the number word (rejected), and places a real number word beside it (rejected). P5-12's fixed set in `apps/agent/test/golden/open-prose.test.ts` loses the three accepted false rejects (`hai bên cùng xác nhận`, `hai bên cùng đồng ý`, `cả hai bên`) and keeps every true one.
