// The hand-written Ask recordings (AGENT.md §8), as data: each case is the question, the tool calls and the reply a
// model would make. They stay hand-written until the P5-10 live run records them. After a change to the ask prompt or
// its tools, rewrite them with `pnpm --filter agent exec tsx test/golden/ask-cases.ts`; ask.test.ts fails while one is stale.
import { isoDate } from '@esta/core/date';
import { askPrompt } from '../../src/prompts/ask';
import { JOBS } from '../../src/jobs/registry';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, writeRecording, type Recording } from '../../src/replay/store';
import { canonicalInput } from '../../src/sdk/session';
import { mcpToolName } from '../../src/tools/server';

export type AskCase = {
  readonly id: string;
  readonly question: string;
  readonly toolCalls: ReadonlyArray<{ readonly name: string; readonly input: Record<string, unknown> }>;
  readonly reply: string;
};

const PROPERTIES = { name: mcpToolName('list_properties'), input: {} };

/** On the full seed, list_properties hands out f1 to f7 in code order: BAOLOC, BIENHOA, DIAN, LONGAN, Q1, Q7, THUDUC. */
export const ASK_CASES: readonly AskCase[] = [
  {
    id: 'q1-di-an-income',
    question: 'Tháng này thu được bao nhiêu từ Dĩ An?',
    toolCalls: [PROPERTIES, { name: mcpToolName('ledger'), input: { property: 'f3', year: 2026, month: 10 } }],
    reply: 'Từ đầu tháng {{f8.period_date_display}} đến nay, {{f3.property_label}} đã thu {{f8.income_display}} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của {{f3.property_label}}](f8).',
  },
  {
    id: 'missing-market-price',
    question: 'Giá thị trường của Đất Bảo Lộc hiện nay là bao nhiêu?',
    toolCalls: [PROPERTIES],
    reply: 'Ứng dụng chưa có giá thị trường hiện nay của {{f1.property_label}}, nên Trợ lý không ước tính con số nào.\n\nKhi có định giá mới, bạn có thể ghi vào hồ sơ của tài sản này.',
  },
];

export const ASK_CONTEXT = { locale: 'vi', today: isoDate('2026-10-07'), timezone: 'Asia/Ho_Chi_Minh' } as const;

export function askRecording(askCase: AskCase, prompt = askPrompt({ ...ASK_CONTEXT, question: askCase.question })): Recording {
  const input = canonicalInput({ spec: JOBS.ask, prompt, canon: canonicalizer({ householdName: 'Gia đình Demo' }) });
  return {
    version: 1,
    kind: 'ask',
    inputHash: inputHash(input),
    input,
    label: `Hand-written for ${askCase.id} on the full seed at 2026-10-07 07:00 (P5-07a); the live recording waits for the P5-10 live run.`,
    model: 'hand-written',
    numTurns: askCase.toolCalls.length + 1,
    toolCalls: askCase.toolCalls.map((call) => ({ ...call })),
    reply: askCase.reply,
  };
}

if (import.meta.main) {
  for (const askCase of ASK_CASES) console.log(writeRecording(DEFAULT_REPLAY_DIR, askRecording(askCase)));
}
