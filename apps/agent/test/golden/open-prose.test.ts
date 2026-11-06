import { isoDate } from '@esta/core/date';
import { OPEN_PROSE } from '@esta/core/guard/fixtures/open-prose';
import { describe, expect, it } from 'vitest';
import { askRequest } from '../../src/jobs/ask';
import { SOURCE_REJECT } from '../../src/prompts/ask';
import { inputHash } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR } from '../../src/replay/store';
import { canonicalInput, replaySession, type SessionRequest } from '../../src/sdk/session';
import { memoryDb } from '@esta/ops/test/memory-db';
import { ANSWER, answerRow, askRpcs, askTables, CONVERSATION, QUESTION } from '../ask-seed';
import { clockOn, HOUSEHOLD } from '../full-seed';
import { tempJobDir } from '../job-dir';
import { ASK_CASES, ASK_CONTEXT, caseSession, rejectedTexts } from './ask-cases';
import { replayedReads } from './ask-reads';

/**
 * The fixed replay set of the live open-prose guard probe (`pnpm agent:guard-probe`, P5-12): what the model wrote for
 * each prompt, guarded again with today's word table. A first pass may be rejected only for the text listed here: a
 * number or count the model typed, or the `hai` of `hai bên` (both parties): the guard reads no idiom, so `hai bên`, `ba mẹ`
 * and `cả hai` are rejected like any number word and the style rule of the prompt steers the model away from them
 * (docs/plan/trail/phase-5-guard.md, P5-10d). Any other reject is a false one.
 */
const FIRST_PASS_REJECTS: Readonly<Record<string, readonly string[]>> = {
  'vi-zalo-price-change': ['hai'],
  'vi-choose-tenant': ['hai'],
  'vi-late-tenant': ['5'],
  'vi-inheritance': ['hai'],
  // Re-recorded in the #496 run: the first pass wrote `cả hai loại` (both kinds), a false reject like `hai bên`. Only its hand-written source-repair turn is older, because the probe refused the third turn (a recording holding an ID-like number).
  'vi-red-pink-book': ['hai'],
  // `đồng loạt` and `phần trăm` are number words to the guard; the style rule now steers the model to `cùng lúc` and `theo tỷ lệ` (#496).
  'vi-raise-rent': ['đồng'],
  'vi-property-manager': ['trăm'],
  // A legal answer with no official page is sent back for one, which names no text (P5-10d).
  'vi-bank-letter': [SOURCE_REJECT],
  'vi-transfer-procedure': [SOURCE_REJECT],
  'vi-notarize-lease': [SOURCE_REJECT],
  // A link whose text repeats its target: the whole sentence is the rejected text.
  'vi-electrician': ['Chào anh/chú, nhờ anh/chú đến sửa giúp ổ cắm ở Phòng 2, [Dãy trọ Dĩ An](Dãy trọ Dĩ An). Người thuê là Trần Thị Bình Demo. Anh/chú báo giúp tôi thời gian có thể đến để tôi báo lại người thuê sắp xếp. Cảm ơn anh/chú.'],
};

const reads = replayedReads();
const jobDir = tempJobDir('esta-probe-replay-');

async function replayProbe(question: string, id: string) {
  const tables = askTables(question);
  const prepared = await askRequest({ db: memoryDb(tables, [], {}, {}, askRpcs(tables)), householdId: HOUSEHOLD, jobId: `probe-${id}`, conversationId: CONVERSATION, questionId: QUESTION, answerId: ANSWER, locale: 'vi', asOf: isoDate('2026-10-07'), timezone: ASK_CONTEXT.timezone, question, earlier: null, seed: [], deep: false, topic: null, reads, clock: clockOn('2026-10-07T07:00:00+07:00') });
  const request: SessionRequest = caseSession(prepared, jobDir);
  let turn = request;
  let firstRejected: string[] | null = null;
  for (;;) {
    const run = await replaySession(turn, DEFAULT_REPLAY_DIR);
    const repair = await prepared.nextTurn?.();
    if (repair === null || repair === undefined) {
      await prepared.finish({ reply: run.result.text, model: run.model, sessionId: run.result.sessionId, turnHash: inputHash(canonicalInput(turn)) });
      return { firstRejected: firstRejected ?? [], answer: answerRow(tables) };
    }
    firstRejected ??= rejectedTexts(repair);
    turn = { ...request, prompt: repair, resume: { sessionId: run.result.sessionId, afterInputHash: inputHash(canonicalInput(turn)) } };
  }
}

describe('the open-prose guard probe, replayed (AGENT.md §6.3, P5-12)', () => {
  it('asks no question a hand-written case asks, so no recording stands for two', () => {
    const cases = new Set(ASK_CASES.map(({ question }) => question));
    expect(OPEN_PROSE.filter(({ question }) => cases.has(question)).map(({ id }) => id)).toEqual([]);
  });

  it.each(OPEN_PROSE)('$id ends done, and its first pass is rejected only for the text it lists', async ({ id, question }) => {
    const { firstRejected, answer } = await replayProbe(question, id);
    expect([...new Set(firstRejected)].toSorted()).toEqual([...(FIRST_PASS_REJECTS[id] ?? [])].toSorted());
    expect(answer.status).toBe('done');
    expect(answer.content_md).not.toMatch(/[{}]/);
  });
});
