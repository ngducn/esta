import { isoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { describe, expect, it } from 'vitest';
import { askRequest } from '../src/jobs/ask';
import { fakeDb } from '../src/test/fake-db';
import { mcpToolName } from '../src/tools/server';
import { askRpcs, askTables } from './ask-seed';
import { askCase, caseRequest } from './golden/ask-cases';
import { replayedReads } from './golden/ask-reads';
import { clockOn, HOUSEHOLD } from './full-seed';
import { ANSWER, CONVERSATION, QUESTION } from './ask-seed';

async function depositsAsked(question: string) {
  const tables = askTables(question);
  const prepared = await caseRequest({ ...askCase('q4-deposits-held'), question }, { db: fakeDb(tables, [], {}, {}, askRpcs(tables)), householdId: HOUSEHOLD, reads: replayedReads() });
  const overview = prepared.tools.get(mcpToolName('portfolio_overview'));
  if (overview === undefined) throw new Error('portfolio_overview is not bound');
  return JSON.stringify(await overview.run({}));
}

describe('the amounts a tool hands the model (#338)', () => {
  it('are written the Vietnamese way for a Vietnamese question', async () => {
    expect(await depositsAsked('Tổng tiền cọc đang giữ là bao nhiêu?')).toMatch(/deposits_held_display":"[\d.]+\u00a0₫"/u);
  });

  it('are written the English way for an English question, as the English screens write them', async () => {
    expect(await depositsAsked('How much deposit money are we holding right now?')).toMatch(/deposits_held_display":"[\d,]+\u00a0₫"/u);
  });
});

async function leasesAsked(question: string, household: Locale) {
  const tables = askTables(question);
  const asOf = isoDate('2026-10-07');
  const prepared = await askRequest({
    db: fakeDb(tables, [], {}, {}, askRpcs(tables)),
    householdId: HOUSEHOLD,
    jobId: 'amount-language',
    conversationId: CONVERSATION,
    questionId: QUESTION,
    answerId: ANSWER,
    locale: household,
    asOf,
    timezone: 'Asia/Ho_Chi_Minh',
    question,
    earlier: null,
    seed: [],
    deep: false,
    topic: null,
    reads: replayedReads(),
    clock: clockOn(`${asOf}T07:00:00+07:00`),
  });
  const tool = prepared.tools.get(mcpToolName('list_leases'));
  if (tool === undefined) throw new Error('list_leases is not bound');
  const { leases } = (await tool.run({ status: 'active' })) as { leases: { rent_display: string | null; deposit_held_display: string }[] };
  return leases.flatMap((lease) => [lease.rent_display, lease.deposit_held_display]);
}

describe('the lease amounts a tool hands the model', () => {
  it.each([
    ['an English question in a Vietnamese household', 'How much rent do the tenants pay each month?', 'vi', /^[\d,]+\u00a0₫$/u],
    ['a Vietnamese question in an English household', 'Người thuê trả bao nhiêu tiền nhà mỗi tháng?', 'en', /^[\d.]+\u00a0₫$/u],
    ['a Vietnamese question in a Vietnamese household', 'Người thuê trả bao nhiêu tiền nhà mỗi tháng?', 'vi', /^[\d.]+\u00a0₫$/u],
    ['an English question in an English household', 'How much rent do the tenants pay each month?', 'en', /^[\d,]+\u00a0₫$/u],
  ] as const)('are written in the answer language for %s', async (_name, question, household, shape) => {
    const amounts = await leasesAsked(question, household);
    expect(amounts.length).toBeGreaterThan(0);
    for (const amount of amounts) expect(amount).toMatch(shape);
  });
});
