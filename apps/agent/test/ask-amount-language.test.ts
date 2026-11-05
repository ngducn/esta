import { describe, expect, it } from 'vitest';
import { fakeDb } from '../src/test/fake-db';
import { mcpToolName } from '../src/tools/server';
import { askRpcs, askTables } from './ask-seed';
import { askCase, caseRequest } from './golden/ask-cases';
import { replayedReads } from './golden/ask-reads';
import { HOUSEHOLD } from './full-seed';

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
