import { isoDate } from '@esta/core/date';
import { OPEN_PROSE } from '@esta/core/guard/fixtures/open-prose';
import { describe, expect, it } from 'vitest';
import { askRequest } from '../../src/jobs/ask';
import { JOBS } from '../../src/jobs/registry';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR } from '../../src/replay/store';
import { canonicalInput, replaySession, type SessionRequest } from '../../src/sdk/session';
import { fakeDb } from '../../src/test/fake-db';
import { ANSWER, answerRow, askRpcs, askTables, CONVERSATION, QUESTION } from '../ask-seed';
import { clockOn, HOUSEHOLD } from '../full-seed';
import { tempJobDir } from '../job-dir';
import { ASK_CASES, ASK_CONTEXT, rejectedTexts } from './ask-cases';
import { replayedReads } from './ask-reads';

/**
 * The fixed replay set of the live open-prose guard probe (`pnpm agent:guard-probe`, P5-12): what the model wrote for
 * each prompt, guarded again with today's word table. A first pass may be rejected only for the text listed here: a
 * number the model typed, or the `hai` of `hai bên` (both parties), which the guard rejects on purpose because `hai bên
 * thuê` counts tenants (docs/plan/trail/p5-12-guard-probe.md). Any other reject is a false one.
 */
const FIRST_PASS_REJECTS: Readonly<Record<string, readonly string[]>> = {
  'vi-zalo-reminder': ['5'],
  'vi-choose-tenant': ['hai'],
  'vi-zalo-welcome': ['2'],
  'vi-zalo-thanks': ['Hai'],
  'vi-rent-tax': ['hai'],
  'vi-red-pink-book': ['hai'],
  'vi-transfer-procedure': ['hai'],
  'vi-repair-first': ['hai'],
  'vi-raise-rent': ['Q7:', 'hai'],
  'en-rent-by-year': ['hai'],
};

const reads = replayedReads();
const jobDir = tempJobDir('esta-probe-replay-');

async function replayProbe(question: string, id: string) {
  const tables = askTables(question);
  const prepared = askRequest({ db: fakeDb(tables, [], {}, {}, askRpcs(tables)), householdId: HOUSEHOLD, jobId: `probe-${id}`, conversationId: CONVERSATION, questionId: QUESTION, answerId: ANSWER, locale: 'vi', asOf: isoDate('2026-10-07'), timezone: ASK_CONTEXT.timezone, question, earlier: null, seed: [], deep: false, reads, clock: clockOn('2026-10-07T07:00:00+07:00') });
  const request: SessionRequest = { spec: JOBS.ask, prompt: prepared.prompt, jobDir, configDir: jobDir, tools: prepared.tools, canon: canonicalizer({ householdName: 'Gia đình Demo', jobDir }), ...(prepared.onText === undefined ? {} : { onText: prepared.onText }) };
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
