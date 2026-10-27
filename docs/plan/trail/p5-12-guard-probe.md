# The number guard on open prose (P5-12)

Trợ lý's thread opens Hỏi to advice, letters and Zalo messages, where ordinary words such as `hai bên` or `ba mẹ` hold a number word. This probe measures how often the guard rejects such a word when it reads as no number.

## How it ran

- The prompts are the 27 in `packages/core/src/guard/fixtures/open-prose.ts`, 22 in Vietnamese and 5 in English.
- `pnpm agent:guard-probe` sent each prompt through `ask` live on slot 2's `full` seed at 2026-10-07 07:00, with `claude-sonnet-5-5`. It ran twice on 2026-10-25 as a spike, never in CI.
- A first-pass reject is false when the word it names reads as no number in its sentence.
- Every turn of the second run is kept as a recording in `fixtures/agent-replay/ask/`. `apps/agent/test/golden/open-prose.test.ts` replays them against today's word table and fails on any reject outside the true ones it lists.

## Results

| Run | Prompts | First pass rejected | With a false reject | Repair rejected | Ended in `error` |
| --- | --- | --- | --- | --- | --- |
| Live, before the compounds | 27 | 11 | 8 | 1 | 1 |
| Live, after the prompt fixes and `hai bên`, `bên thứ ba` | 27 | 8 | 1 | 0 | 0 |
| Replay of that run on the final word table | 27 | 7 | 0 | 0 | 0 |
| Replay after fix round 1, with `hai bên` and `ba mẹ` rejected | 27 | 10 | 2, both `hai bên` | 0 | 0 |

- Before, the false rejects were `hai bên` in seven answers and `bên thứ ba` in one. The row in `error` linked a record as `({{f3.handle}})`, and the repair turn wrote it again.
- After, the one false reject was `đồng hành`. `words.ts` now passes it, so the replay passes that answer on its first pass.
- The 7 true rejects are numbers the model typed: a room number from the message, a district written `Q7`, and counts such as `cả hai` or `hai loại`. Each repair passed.
- `words.ts` gained `bên thứ ba`, `đồng hành`, `chín chắn`, `second opinion` and `double-check`. It also passed `ba mẹ` and `hai bên` until fix round 1 removed them (below). Each has a case in `packages/core/src/guard/open-prose.test.ts` that still rejects a real number word next to it. The guard also reads a single hyphen as a space now, so `mùng-một`, `tháng-một` and `quý-I` stay rejected.
- A link written as `({{f8}})` or `({{f3.handle}})` now resolves to that record's link, as `(f8)` does, so its braces never reach the answer.

## Fix round 1: `hai bên` and `ba mẹ` are rejected again

Review found that the two compounds let real counts through. `Có hai bên thuê.` counts two tenants and `Ba mẹ con chị Hoa thuê phòng.` counts a family of three, and the guard passed both. The live run showed the risk was real: the first pass for `vi-zalo-thanks` wrote `Hai bên thuê chưa từng trả trễ…`, a count of two tenants, and the guard passed it.

Both compounds are now ordinary number words again. The trade is a false reject of `hai bên` when it means both parties to a contract. The repair turn handles it: the prompt already asks for `bên thuê và bên cho thuê`, and the live repair of `vi-raise-rent` wrote exactly that.

| Probe | First pass now rejects | Kind | Repair turn in the replay set |
| --- | --- | --- | --- |
| `vi-zalo-thanks` | `Hai` (`Hai bên thuê`) | true count | hand-written: `Các bên thuê` |
| `vi-transfer-procedure` | `hai` (`cả hai bên`) | true count | hand-written: `bên chuyển và bên nhận` |
| `vi-repair-first` | `hai` (`hai bên cùng xác nhận`) | accepted false reject | hand-written: `bên thuê và bên cho thuê` |
| `vi-raise-rent` | `Q7:` and `hai` (`hai bên cùng đồng ý`) | true, then accepted false | the live repair reply, re-keyed |

- The hand-written repair turns take the live first pass and change only those words. Each recording's label says so. The P5-10 live run replaces them.
- The `vi-inheritance` template now writes `Bố mẹ`, as the live answer did.
- `packages/core/src/guard/open-prose.test.ts` rejects `Có hai bên thuê.`, `Ba mẹ con chị Hoa thuê phòng.`, `Còn hai bên phòng.` and `Ba mẹ ba mẹ.`.

## Findings left open

- 2 of the 5 English prompts were answered in Vietnamese in the second run, although the prompt says to reply in the message's language. The P5-10 live run checks this again (#348).
