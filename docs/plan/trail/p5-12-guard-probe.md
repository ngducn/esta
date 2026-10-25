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

- Before, the false rejects were `hai bên` in seven answers and `bên thứ ba` in one. The row in `error` linked a record as `({{f3.handle}})`, and the repair turn wrote it again.
- After, the one false reject was `đồng hành`. `words.ts` now passes it, so the replay passes that answer on its first pass.
- The 7 true rejects are numbers the model typed: a room number from the message, a district written `Q7`, and counts such as `cả hai` or `hai loại`. Each repair passed.
- `words.ts` gained `ba mẹ`, `hai bên`, `bên thứ ba`, `đồng hành`, `chín chắn`, `second opinion` and `double-check`. Each has a case in `packages/core/src/guard/open-prose.test.ts` that still rejects a real number word next to it. The guard also reads a single hyphen as a space now, so `mùng-một`, `tháng-một` and `quý-I` stay rejected.
- A link written as `({{f8}})` or `({{f3.handle}})` now resolves to that record's link, as `(f8)` does, so its braces never reach the answer.

## Findings left open

- 2 of the 5 English prompts were answered in Vietnamese in the second run, although the prompt says to reply in the message's language. The P5-10 live run checks this again (#348).
