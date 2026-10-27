import { checkNote } from '@esta/core/guard';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JOBS } from '../../src/jobs/registry';
import { askRepairPrompt } from '../../src/prompts/ask';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { writeRecording } from '../../src/replay/store';
import { pollOnce } from '../../src/runner';
import { canonicalInput } from '../../src/sdk/session';
import { fakeDb } from '../../src/test/fake-db';
import type { AskTopic } from '../../src/tools/topic-reads';
import { answerRow, askRpcs, askTables, askWorker, QUESTION } from '../ask-seed';
import { HOUSEHOLD } from '../full-seed';
import { askCase, caseRequest } from '../golden/ask-cases';
import { replayedReads } from '../golden/ask-reads';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

const ASKER = '00000000-0000-4000-8000-0000000c0f01';
const NOTE = '00000000-0000-4000-8000-0000000c0f02';
const NOTE_BODY = 'Hóa đơn của Hoàng Văn Em Demo vẫn chưa thanh toán. Còn nợ 2.800.000 ₫.';
const REPLY = 'Khách này trễ mấy lần rồi?';

/** The prompt the worker writes for `topic` on the ask tables, through the same job a golden case prepares. */
async function promptFor(topic: AskTopic, question = REPLY) {
  const tables = askTables(question);
  return (await caseRequest({ id: 'topic', question, toolCalls: [], reply: '', topic }, { db: fakeDb(tables, [], {}, {}, askRpcs(tables)), householdId: HOUSEHOLD, reads: replayedReads() })).prompt;
}

/** The ask tables with her message replying to a note, asked by a member who is not an operator and who has an earlier segment. */
function replyTables(audience: 'all' | 'operator') {
  const tables = askTables(REPLY);
  const earlier = '00000000-0000-4000-8000-0000000c0f03';
  Object.assign(tables.conversations?.[0] ?? {}, { created_by: ASKER, last_asked_at: '2026-10-07T00:05:00.000Z' });
  tables.conversations?.push({ id: earlier, household_id: HOUSEHOLD, created_by: ASKER, last_asked_at: '2026-10-07T00:01:00.000Z', sdk_session_id: null, sdk_turn_hash: null, sdk_handles: 0 });
  tables.messages?.unshift(
    { id: '00000000-0000-4000-8000-0000000c0f04', household_id: HOUSEHOLD, conversation_id: earlier, role: 'user', content_md: 'Câu hỏi trước', status: 'done', created_at: '2026-10-07T00:01:00.000Z' },
    { id: '00000000-0000-4000-8000-0000000c0f05', household_id: HOUSEHOLD, conversation_id: earlier, role: 'assistant', content_md: 'Câu trả lời trước.', status: 'done', created_at: '2026-10-07T00:01:00.001Z' },
  );
  Object.assign(tables.messages?.find((row) => row.id === QUESTION) ?? {}, { topic_item_id: NOTE });
  tables.agent_items = [{ id: NOTE, household_id: HOUSEHOLD, kind: 'alert', severity: 'action', audience, title: 'Phòng 5 Dãy trọ Dĩ An quá hạn 11 ngày', body_md: NOTE_BODY, related: { facts: [], links: [] }, status: 'new' }];
  tables.household_members = [{ household_id: HOUSEHOLD, user_id: ASKER, role: 'member', is_operator: false }];
  return tables;
}

function record(prompt: string, replies: readonly string[]): string {
  const dir = tempDir('esta-ask-topic-replay-');
  const canon = canonicalizer({ householdName: 'Gia đình Demo' });
  let turn = prompt;
  let after: string | undefined;
  for (const reply of replies) {
    const input = canonicalInput({ spec: JOBS.ask, prompt: turn, canon, ...(after === undefined ? {} : { resume: { sessionId: null, afterInputHash: after } }) });
    writeRecording(dir, { version: 1, kind: 'ask', inputHash: inputHash(input), input, model: 'test', numTurns: 1, toolCalls: [], reply });
    after = inputHash(input);
    const checked = checkNote(reply, new Map());
    turn = askRepairPrompt(checked.ok ? [] : checked.reason);
  }
  return dir;
}

describe('a message with a topic (AGENT.md §5.6 step 7, P5-13)', () => {
  it('a reply to a note reads the records its links name before the first turn, so they hold the first handles', async () => {
    const prompt = await promptFor(askCase('t3-reply-late-count').topic as AskTopic);
    const calls = prompt.split('\n').filter((line) => / answered \{/.test(line));
    expect(calls.map((line) => line.slice(0, line.indexOf(' answered')))).toEqual(['list_properties {}', 'collections {"year":2026,"month":10,"property":"f3"}']);
    expect(calls[0]).toContain('{"handle":"f1"');
    expect(calls[1]).toMatch(/^collections .* answered \{"bills":\[\{"handle":"f8","property_label":"Dãy trọ Dĩ An","unit_label":"Phòng 5","tenant_name":"Hoàng Văn Em Demo","status":"overdue"/);
    expect(prompt).toContain('never copy a figure, date or name from its text');
  });

  it('a question about a property calls get_property first, then property_metrics, on its list_properties handle', async () => {
    const prompt = await promptFor(askCase('t4-property-mortgage').topic as AskTopic, 'Tài sản này đang thế chấp ở đâu?');
    const calls = prompt.split('\n').filter((line) => / answered \{/.test(line)).map((line) => line.slice(0, line.indexOf(' answered')));
    expect(calls).toEqual(['list_properties {}', 'get_property {"property":"f1"}', 'property_metrics {"property":"f1","year":2026}']);
    expect(prompt).toContain('{"property":{"handle":"f8","property_label":"Đất Bảo Lộc"');
  });

  it('a property archived since she asked loads as no topic', async () => {
    const prompt = await promptFor({ kind: 'property', propertyId: '00000000-0000-4000-8000-0000000a7c01' });
    expect(prompt).not.toContain(' answered {');
    expect(prompt).not.toContain('asks about the property');
  });

  it('an answer that repeats a figure of the note, with no handle, is rejected, the repair cites a record, and no earlier segment seeds the turn', async () => {
    const tables = replyTables('all');
    const prompt = await promptFor({ kind: 'note', title: 'Phòng 5 Dãy trọ Dĩ An quá hạn 11 ngày', body: NOTE_BODY, links: [] });
    expect(prompt).toContain(`Note text:\n${NOTE_BODY}`);
    const copied = 'Khách vẫn còn nợ 2.800.000 ₫.';
    const { worker, writes } = askWorker(tables, tempDir('esta-ask-topic-jobs-'), record(prompt, [copied, 'Khách thuê {{f3.property_label}} vẫn còn nợ tiền thuê.']));
    await pollOnce(worker);
    expect(tables.agent_jobs?.[0]).toMatchObject({ status: 'done', error: null });
    expect(writes.some(({ row }) => String(row.content_md ?? '').includes('2.800.000'))).toBe(false);
    expect(answerRow(tables)).toMatchObject({ status: 'done', content_md: 'Khách thuê Dãy trọ Dĩ An vẫn còn nợ tiền thuê.' });
  });

  it('refuses a reply to an operator note asked by a member who is not an operator, before any model turn', async () => {
    const tables = replyTables('operator');
    const { worker } = askWorker(tables, tempDir('esta-ask-topic-jobs-'), tempDir('esta-ask-topic-replay-'));
    await pollOnce(worker);
    expect(tables.agent_jobs?.[0]).toMatchObject({ status: 'failed', error: expect.stringMatching(/for operators only/) });
    expect(answerRow(tables)).toMatchObject({ status: 'error', content_md: '' });
  });

});
