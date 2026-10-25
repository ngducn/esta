import { checkNote } from '@esta/core/guard';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JOBS } from '../../src/jobs/registry';
import { askPrompt, askRepairPrompt } from '../../src/prompts/ask';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { writeRecording } from '../../src/replay/store';
import { pollOnce } from '../../src/runner';
import { canonicalInput } from '../../src/sdk/session';
import { mcpToolName } from '../../src/tools/server';
import { ANSWER, answerRow, askTables, askWorker, ASK_JOB, CONVERSATION, QUESTION } from '../ask-seed';
import { ASK_CONTEXT } from '../golden/ask-cases';

const QUESTION_TEXT = 'Tháng này thu được bao nhiêu từ Dĩ An?';
const TOOLS = [
  { name: mcpToolName('list_properties'), input: {} },
  { name: mcpToolName('ledger'), input: { property: 'f3', year: 2026, month: 10 } },
];
const GOOD = '{{f3.property_label}} đã thu {{f8.income_display}}. Xem [sổ thu chi](f8).';
const BAD = 'Đã thu tiền thuê. Tháng trước thu khoảng hai triệu.';
const BAD_RESIDUE = 'Tháng trước thu khoảng hai triệu.';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};

function recordTurns(replies: readonly string[]): string {
  const dir = tempDir('esta-ask-replay-');
  const canon = canonicalizer({ householdName: 'Gia đình Demo' });
  let prompt = askPrompt({ ...ASK_CONTEXT, question: QUESTION_TEXT });
  let after: string | undefined;
  for (const [index, reply] of replies.entries()) {
    const input = canonicalInput({ spec: JOBS.ask, prompt, canon, ...(after === undefined ? {} : { resume: { sessionId: null, afterInputHash: after } }) });
    const toolCalls = index === 0 ? TOOLS : [];
    writeRecording(dir, { version: 1, kind: 'ask', inputHash: inputHash(input), input, model: 'test', numTurns: toolCalls.length + 1, toolCalls, reply });
    after = inputHash(input);
    const checked = checkNote(reply, new Map());
    prompt = askRepairPrompt(checked.ok ? [] : checked.reason);
  }
  return dir;
}

async function run(replies: readonly string[], payload?: Record<string, unknown>) {
  const tables = askTables(QUESTION_TEXT, payload);
  const jobsDir = tempDir('esta-ask-jobs-');
  const { worker, writes } = askWorker(tables, jobsDir, recordTurns(replies));
  await pollOnce(worker);
  const shown = writes.filter(({ table, row }) => table === 'messages' && typeof row.content_md === 'string').map(({ row }) => String(row.content_md));
  return { tables, jobsDir, shown, writes, job: tables.agent_jobs?.[0] as { status: string; error: string | null } };
}

describe('the ask job (AGENT.md §5.6)', () => {
  it('streams the answer into its row and finishes it done, in the conversation\'s own directory', async () => {
    const { tables, jobsDir, shown, job } = await run([GOOD]);
    expect(job.status).toBe('done');
    expect(answerRow(tables)).toMatchObject({ status: 'done', content_md: expect.stringMatching(/^Dãy trọ Dĩ An đã thu 1\.000\.000\s₫\. Xem \[sổ thu chi\]\(esta:\/\/ledger\//) });
    expect(shown.every((content) => !/[{}]/.test(content))).toBe(true);
    expect(existsSync(join(jobsDir, 'conversations', CONVERSATION)), 'the conversation keeps its directory for the next question').toBe(true);
    expect(existsSync(join(jobsDir, ASK_JOB))).toBe(false);
  });

  it('a violating sentence never reaches the row, and the repair turn replaces what it showed', async () => {
    const { tables, shown, job } = await run([BAD, GOOD]);
    expect(job.status).toBe('done');
    expect(shown.some((content) => content.includes('hai'))).toBe(false);
    expect(shown[1], 'after the reset, the first answer showed its passing sentence').toBe('Đã thu tiền thuê.');
    expect(answerRow(tables).content_md).toMatch(/^Dãy trọ Dĩ An đã thu 1\.000\.000\s₫\. Xem \[sổ thu chi\]/);
    expect(tables.agent_items).toEqual([]);
  });

  it('a second violation fails the job, sets the answer to error and leaves the operator item', async () => {
    const { tables, shown, job } = await run([BAD, BAD]);
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/^number_guard:/);
    expect(answerRow(tables)).toMatchObject({ status: 'error', content_md: '' });
    expect(shown.some((content) => content.includes('hai'))).toBe(false);
    expect(tables.agent_items).toEqual([expect.objectContaining({ audience: 'operator', kind: 'system', dedupe_key: `number_guard:${ASK_JOB}` })]);
    expect(String(tables.agent_items?.[0]?.body_md)).toContain(BAD_RESIDUE);
  });

  it('a turn that only calls tools fails once, saying the model wrote no answer', async () => {
    const { tables, job } = await run(['']);
    expect(job).toMatchObject({ status: 'failed', error: expect.stringMatching(/without writing an answer/) });
    expect(answerRow(tables)).toMatchObject({ status: 'error', content_md: '' });
  });

  it('an answer may hold a table, and its record links stream with the text', async () => {
    const { tables, writes } = await run(['| Tài sản | Đã thu |\n| --- | --- |\n| [{{f3.property_label}}](f8) | {{f8.income_display}} |']);
    expect(answerRow(tables)).toMatchObject({ status: 'done', content_md: expect.stringMatching(/^\| Tài sản \| Đã thu \|\n\| --- \| --- \|\n\| \[Dãy trọ Dĩ An\]\(esta:\/\/ledger\/[0-9a-f-]+\) \| 1\.000\.000\s₫ \|$/) });
    const streamed = writes.filter(({ row }) => typeof row.content_md === 'string' && row.content_md !== '' && row.status === undefined);
    expect(streamed.length).toBeGreaterThan(1);
    expect(streamed.map(({ row }) => row.refs)).toEqual(streamed.map(({ row }) => answerRow(tables).refs.filter((link: string) => String(row.content_md).includes(link))));
  });

  it.each(['../../escape', `${CONVERSATION}/../..`, 'not-a-uuid'])('refuses the conversation id %j and makes no directory for it', async (conversationId) => {
    const { tables, jobsDir, job } = await run([GOOD], { conversation_id: conversationId, question_id: QUESTION, answer_id: ANSWER });
    expect(job.status).toBe('failed');
    expect(job.error).toMatch(/names no conversation/);
    expect(existsSync(join(jobsDir, 'escape'))).toBe(false);
    expect(existsSync(join(jobsDir, 'conversations'))).toBe(false);
    expect(answerRow(tables).status).toBe('error');
  });
});
