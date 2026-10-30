import { checkNote } from '@esta/core/guard';
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { JOBS } from '../../src/jobs/registry';
import { askFollowUpPrompt, askPrompt, askRepairPrompt } from '../../src/prompts/ask';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { writeRecording } from '../../src/replay/store';
import { pollOnce } from '../../src/runner';
import { canonicalInput } from '../../src/sdk/session';
import { mcpToolName } from '../../src/tools/server';
import { ANSWER, answerRow, askTables, askWorker, ASK_JOB, CONVERSATION, QUESTION } from '../ask-seed';
import { HOUSEHOLD as HOUSEHOLD_ID } from '../full-seed';
import { ASK_CONTEXT } from '../golden/ask-cases';
import { tempDirs } from '../job-dir';

const QUESTION_TEXT = 'Tháng này thu được bao nhiêu từ Dĩ An?';
const TOOLS = [
  { name: mcpToolName('list_properties'), input: {} },
  { name: mcpToolName('ledger'), input: { property: 'f3', year: 2026, month: 10 } },
];
const GOOD = '{{f3.property_label}} đã thu {{f8.income_display}}. Xem [sổ thu chi](f8).';
const BAD = 'Đã thu tiền thuê. Tháng trước thu khoảng hai triệu.';
const BAD_RESIDUE = 'Tháng trước thu khoảng hai triệu.';

const tempDir = tempDirs();

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

const violations = (reply: string) => {
  const checked = checkNote(reply, new Map());
  return checked.ok ? [] : checked.reason;
};

type Turn = { readonly prompt: string; readonly reply: string; readonly toolCalls?: typeof TOOLS };

function recordChain(dir: string, turns: readonly Turn[], after?: string): string[] {
  const canon = canonicalizer({ householdName: 'Gia đình Demo' });
  const hashes: string[] = [];
  let previous = after;
  for (const { prompt, reply, toolCalls = [] } of turns) {
    const input = canonicalInput({ spec: JOBS.ask, prompt, canon, ...(previous === undefined ? {} : { resume: { sessionId: null, afterInputHash: previous } }) });
    writeRecording(dir, { version: 1, kind: 'ask', inputHash: inputHash(input), input, model: 'test', numTurns: toolCalls.length + 1, toolCalls, reply });
    previous = inputHash(input);
    hashes.push(previous);
  }
  return hashes;
}

async function run(replies: readonly string[], payload?: Record<string, unknown>) {
  const tables = askTables(QUESTION_TEXT, payload);
  const jobsDir = tempDir('esta-ask-jobs-');
  const { worker, writes } = askWorker(tables, jobsDir, recordTurns(replies));
  await pollOnce(worker);
  const shown = writes.filter(({ table, row }) => table === 'messages' && typeof row.content_md === 'string').map(({ row }) => String(row.content_md));
  return { tables, jobsDir, shown, writes, job: tables.agent_jobs?.[0] as { status: string; error: string | null } };
}

const FOLLOW_UP = 'Còn tháng 9 thì sao?';
const FOLLOW_UP_TOOLS = [
  { name: mcpToolName('list_properties'), input: {} },
  { name: mcpToolName('ledger'), input: { property: 'f11', year: 2026, month: 9 } },
];
const SEPTEMBER = '{{f11.property_label}} thu {{f16.income_display}} trong tháng {{f16.period_date_display}}.';
const FOLLOW_UP_PROMPT = askFollowUpPrompt({ locale: ASK_CONTEXT.locale, today: ASK_CONTEXT.today, timezone: ASK_CONTEXT.timezone, question: FOLLOW_UP, firstHandle: 9 });
const AUGUST = 'Còn tháng 8?';
const AUGUST_TURN = {
  prompt: askFollowUpPrompt({ locale: ASK_CONTEXT.locale, today: ASK_CONTEXT.today, timezone: ASK_CONTEXT.timezone, question: AUGUST, firstHandle: 18 }),
  reply: '{{f20.property_label}} thu {{f25.income_display}} trong tháng {{f25.period_date_display}}.',
  toolCalls: [{ name: mcpToolName('list_properties'), input: {} }, { name: mcpToolName('ledger'), input: { property: 'f20', year: 2026, month: 8 } }],
};

async function afterQuestion1() {
  const dir = tempDir('esta-ask-replay-');
  const [first = ''] = recordChain(dir, [{ prompt: askPrompt({ ...ASK_CONTEXT, question: QUESTION_TEXT }), reply: GOOD, toolCalls: TOOLS }]);
  const tables = askTables(QUESTION_TEXT);
  const jobsDir = tempDir('esta-ask-jobs-');
  const { worker, writes } = askWorker(tables, jobsDir, dir);
  await pollOnce(worker);
  const afterFirst = { ...tables.conversations?.[0] };
  let asked = 0;
  async function ask(question: string, turns: readonly Turn[], resumes?: string) {
    asked += 1;
    const ids = { question: `00000000-0000-4000-8000-0000000c0b${asked}2`, answer: `00000000-0000-4000-8000-0000000c0b${asked}3`, job: `00000000-0000-4000-8000-0000000c0b${asked}4` };
    tables.messages?.push(
      { id: ids.question, household_id: HOUSEHOLD_ID, conversation_id: CONVERSATION, role: 'user', content_md: question, status: 'done', topic_item_id: null, topic_property_id: null },
      { id: ids.answer, household_id: HOUSEHOLD_ID, conversation_id: CONVERSATION, role: 'assistant', content_md: '', status: 'streaming', refs: [] },
    );
    tables.agent_jobs?.push({ id: ids.job, household_id: HOUSEHOLD_ID, kind: 'ask', status: 'queued', attempts: 0, max_attempts: 4, run_after: '2026-10-07T00:00:00.000Z', payload: { conversation_id: CONVERSATION, question_id: ids.question, answer_id: ids.answer, deep: false } });
    const hashes = recordChain(dir, turns, resumes);
    const before = writes.length;
    await pollOnce(worker);
    const answer = tables.messages?.find((row) => row.id === ids.answer) as { content_md: string; status: string };
    const shown = writes.slice(before).filter(({ table, row }) => table === 'messages' && typeof row.content_md === 'string').map(({ row }) => String(row.content_md));
    const job = tables.agent_jobs?.find((row) => row.id === ids.job) as { status: string; error: string | null; attempts: number };
    return { hashes, answer, shown, job, conversation: { ...tables.conversations?.[0] } };
  }
  return { first, afterFirst, tables, ask, sessionDir: join(jobsDir, 'conversations', CONVERSATION, 'sdk') };
}

async function followUp(turns: readonly Turn[]) {
  const { first, afterFirst, ask } = await afterQuestion1();
  return { first, afterFirst, ...(await ask(FOLLOW_UP, turns, first)) };
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

  it('a failed answer keeps no link: the error row clears the refs of the text it showed', async () => {
    const { tables, writes, job } = await run([`Xem [sổ thu chi](f8). ${BAD_RESIDUE}`, BAD_RESIDUE]);
    expect(job.status).toBe('failed');
    expect(writes.some(({ row }) => Array.isArray(row.refs) && row.refs.length === 1), 'the first turn streamed its linked sentence').toBe(true);
    expect(answerRow(tables)).toMatchObject({ status: 'error', content_md: '', refs: [] });
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

  it('a follow-up resumes the turn question 1 finished, and its own turn becomes the one the next question resumes', async () => {
    const { first, hashes, afterFirst, conversation, answer, job } = await followUp([{ prompt: FOLLOW_UP_PROMPT, reply: SEPTEMBER, toolCalls: FOLLOW_UP_TOOLS }]);
    expect(afterFirst).toMatchObject({ sdk_turn_hash: first, sdk_session_id: `replay-${first.slice(0, 16)}`, sdk_handles: 8 });
    expect(job).toMatchObject({ status: 'done', error: null });
    expect(answer).toMatchObject({ status: 'done', content_md: 'Dãy trọ Dĩ An thu 19.300.000\u00a0₫ trong tháng 9/2026.' });
    expect(conversation).toMatchObject({ sdk_turn_hash: hashes[0], sdk_session_id: `replay-${hashes[0]?.slice(0, 16)}`, sdk_handles: 17 });
  });

  it('a handle from question 1 names nothing in the follow-up, so its October figure never shows as September', async () => {
    const stale = 'Đã thu {{f8.income_display}}.';
    const { answer, shown, job } = await followUp([
      { prompt: FOLLOW_UP_PROMPT, reply: stale, toolCalls: FOLLOW_UP_TOOLS },
      { prompt: askRepairPrompt(violations(stale)), reply: SEPTEMBER },
    ]);
    expect(job).toMatchObject({ status: 'done', error: null });
    expect(shown.some((content) => content.includes('1.000.000'))).toBe(false);
    expect(answer.content_md).toBe('Dãy trọ Dĩ An thu 19.300.000\u00a0₫ trong tháng 9/2026.');
  });

  it('keeps only the session the next question resumes in the conversation folder, so transcripts stop piling up (#340)', async () => {
    const { first, ask, sessionDir } = await afterQuestion1();
    const sessions = () => readdirSync(join(sessionDir, 'replay-sessions'));
    expect(sessions()).toEqual([`replay-${first.slice(0, 16)}.json`]);
    const stale = 'Đã thu {{f8.income_display}}.';
    const repaired = await ask(FOLLOW_UP, [
      { prompt: FOLLOW_UP_PROMPT, reply: stale, toolCalls: FOLLOW_UP_TOOLS },
      { prompt: askRepairPrompt(violations(stale)), reply: SEPTEMBER },
    ], first);
    expect(repaired.job).toMatchObject({ status: 'done', error: null });
    expect(sessions()).toEqual([`${String(repaired.conversation.sdk_session_id)}.json`]);

    const third = await ask(AUGUST, [AUGUST_TURN], repaired.conversation.sdk_turn_hash as string);
    expect(third.job, 'the fourth turn still resumes the pruned folder').toMatchObject({ status: 'done', error: null, attempts: 1 });
    expect(sessions()).toEqual([`${String(third.conversation.sdk_session_id)}.json`]);
  });

  it('a stray file among the conversation\'s project folders does not fail the answer it follows (#340)', async () => {
    const { first, ask, sessionDir } = await afterQuestion1();
    mkdirSync(join(sessionDir, 'projects'), { recursive: true });
    writeFileSync(join(sessionDir, 'projects', 'stray.json'), '{}');
    const followed = await ask(FOLLOW_UP, [{ prompt: FOLLOW_UP_PROMPT, reply: SEPTEMBER, toolCalls: FOLLOW_UP_TOOLS }], first);
    expect(followed.job).toMatchObject({ status: 'done', error: null, attempts: 1 });
    expect(followed.answer).toMatchObject({ status: 'done', content_md: 'Dãy trọ Dĩ An thu 19.300.000\u00a0₫ trong tháng 9/2026.' });
  });

  it.skipIf(process.getuid?.() === 0)('a prune that fails after the answer is saved logs a warning and leaves the job done (#340)', async () => {
    const { first, ask, sessionDir } = await afterQuestion1();
    const unreadable = join(sessionDir, 'projects', '-tmp-conversation');
    mkdirSync(unreadable, { recursive: true });
    chmodSync(unreadable, 0o000);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const followed = await ask(FOLLOW_UP, [{ prompt: FOLLOW_UP_PROMPT, reply: SEPTEMBER, toolCalls: FOLLOW_UP_TOOLS }], first);
      expect(followed.job).toMatchObject({ status: 'done', error: null, attempts: 1 });
      expect(followed.answer.status).toBe('done');
      expect(warn.mock.calls.flat().join('\n')).toMatch(/old transcripts.*EACCES/s);
    } finally {
      warn.mockRestore();
      chmodSync(unreadable, 0o700);
    }
  });

  it('a follow-up that fails leaves the conversation on question 1\'s turn, so the next question resumes what the family saw', async () => {
    const { first, conversation, answer } = await followUp([
      { prompt: FOLLOW_UP_PROMPT, reply: BAD, toolCalls: FOLLOW_UP_TOOLS },
      { prompt: askRepairPrompt(violations(BAD)), reply: BAD },
    ]);
    expect(answer.status).toBe('error');
    expect(conversation).toMatchObject({ sdk_turn_hash: first, sdk_handles: 8 });
  });

  it('a follow-up whose saved session is gone runs at once in a new session that holds question 1, and the next question resumes that one', async () => {
    const { first, tables, ask, sessionDir } = await afterQuestion1();
    renameSync(sessionDir, `${sessionDir}-moved`);
    const answered = answerRow(tables).content_md;
    const rebuilt = askPrompt({ ...ASK_CONTEXT, question: FOLLOW_UP, earlier: [{ question: QUESTION_TEXT, answer: answered }] });
    expect(rebuilt).toContain('Earlier answer:\nDãy trọ Dĩ An đã thu');
    expect(rebuilt).not.toContain('esta://');
    const followed = await ask(FOLLOW_UP, [{ prompt: rebuilt, reply: SEPTEMBER, toolCalls: FOLLOW_UP_TOOLS }]);
    expect(followed.job).toMatchObject({ status: 'done', error: null, attempts: 1 });
    expect(followed.answer).toMatchObject({ status: 'done', content_md: 'Dãy trọ Dĩ An thu 19.300.000\u00a0₫ trong tháng 9/2026.' });
    expect(followed.conversation).toMatchObject({ sdk_turn_hash: followed.hashes[0], sdk_session_id: `replay-${followed.hashes[0]?.slice(0, 16)}`, sdk_handles: 17 });
    expect(followed.hashes[0]).not.toBe(first);

    const third = await ask(AUGUST, [AUGUST_TURN], followed.hashes[0]);
    expect(third.job).toMatchObject({ status: 'done', error: null, attempts: 1 });
    expect(third.answer.content_md).toMatch(/^Dãy trọ Dĩ An thu .+ trong tháng 8\/2026\.$/);
    expect(third.conversation).toMatchObject({ sdk_turn_hash: third.hashes[0] });
  });

  it('a follow-up whose session is gone with no answered turn to rebuild it from fails at once, and the next question starts a session of its own', async () => {
    const { tables, ask, sessionDir } = await afterQuestion1();
    rmSync(sessionDir, { recursive: true });
    tables.messages?.splice(0, 2);
    const followed = await ask(FOLLOW_UP, []);
    expect(followed.job).toMatchObject({ status: 'failed', attempts: 1 });
    expect(followed.job.error).toMatch(/^The session replay-[0-9a-f]{16} this turn resumes is gone$/);
    expect(followed.answer.status).toBe('error');
    expect(followed.conversation).toMatchObject({ sdk_session_id: null, sdk_turn_hash: null, sdk_handles: 8 });

    const next = 'Tháng 9 Dĩ An thu bao nhiêu?';
    const fresh = await ask(next, [{ prompt: askPrompt({ ...ASK_CONTEXT, question: next }), reply: GOOD, toolCalls: TOOLS }]);
    expect(fresh.job).toMatchObject({ status: 'done', attempts: 1 });
    expect(fresh.conversation).toMatchObject({ sdk_turn_hash: fresh.hashes[0] });
  });

  it('a new segment of the thread starts from the last three answered turns of her previous one, without their links', async () => {
    const member = '00000000-0000-4000-8000-0000000c0e01';
    const previous = '00000000-0000-4000-8000-0000000c0e02';
    const tables = askTables(FOLLOW_UP);
    Object.assign(tables.conversations?.[0] ?? {}, { created_by: member, last_asked_at: '2026-10-07T17:05:00.000Z' });
    const turn = (n: number, answer: string) => [
      { id: `00000000-0000-4000-8000-0000000c0e${n}1`, household_id: HOUSEHOLD_ID, conversation_id: previous, role: 'user', content_md: `Câu hỏi ${n}`, status: 'done', created_at: `2026-10-07T16:5${n}:00.000Z` },
      { id: `00000000-0000-4000-8000-0000000c0e${n}2`, household_id: HOUSEHOLD_ID, conversation_id: previous, role: 'assistant', content_md: answer, status: 'done', created_at: `2026-10-07T16:5${n}:00.001Z` },
    ];
    tables.conversations?.push(
      { id: previous, household_id: HOUSEHOLD_ID, created_by: member, last_asked_at: '2026-10-07T16:54:00.000Z', sdk_session_id: 'replay-x', sdk_turn_hash: 'a'.repeat(64), sdk_handles: 8 },
      { id: '00000000-0000-4000-8000-0000000c0e03', household_id: HOUSEHOLD_ID, created_by: '00000000-0000-4000-8000-0000000c0e04', last_asked_at: '2026-10-07T16:59:00.000Z', sdk_session_id: null, sdk_turn_hash: null, sdk_handles: 0 },
    );
    tables.messages?.unshift(
      ...turn(1, 'Câu trả lời một.'),
      ...turn(2, 'Dãy trọ Dĩ An đã thu 1.000.000\u00a0₫. Xem [sổ thu chi](esta://ledger/93cc970b-f9c2-52f5-bc34-1f1edb76742c?year=2026).'),
      ...turn(3, ''),
      ...turn(4, 'Câu trả lời bốn.'),
      ...turn(5, 'Câu trả lời năm.'),
    );
    const seed = [
      { question: 'Câu hỏi 2', answer: 'Dãy trọ Dĩ An đã thu 1.000.000\u00a0₫. Xem [sổ thu chi](esta://ledger/93cc970b-f9c2-52f5-bc34-1f1edb76742c?year=2026).' },
      { question: 'Câu hỏi 4', answer: 'Câu trả lời bốn.' },
      { question: 'Câu hỏi 5', answer: 'Câu trả lời năm.' },
    ];
    const prompt = askPrompt({ ...ASK_CONTEXT, question: FOLLOW_UP, earlier: seed });
    expect(prompt).toContain('Earlier question:\nCâu hỏi 2\nEarlier answer:\nDãy trọ Dĩ An đã thu 1.000.000\u00a0₫. Xem sổ thu chi.');
    expect(prompt).not.toContain('Câu hỏi 1');
    expect(prompt).not.toContain('esta://');
    const dir = tempDir('esta-ask-replay-');
    recordChain(dir, [{ prompt, reply: '{{f3.property_label}} thu {{f8.income_display}} trong tháng {{f8.period_date_display}}.', toolCalls: [{ name: mcpToolName('list_properties'), input: {} }, { name: mcpToolName('ledger'), input: { property: 'f3', year: 2026, month: 9 } }] }]);
    const { worker } = askWorker(tables, tempDir('esta-ask-jobs-'), dir);
    await pollOnce(worker);
    expect(tables.agent_jobs?.[0]).toMatchObject({ status: 'done', error: null });
    expect(answerRow(tables)).toMatchObject({ status: 'done', content_md: expect.stringMatching(/ trong tháng 9\/2026\.$/) });
  });

  it('her first conversation has no earlier segment, so it starts with the plain prompt', async () => {
    const tables = askTables(QUESTION_TEXT);
    Object.assign(tables.conversations?.[0] ?? {}, { created_by: '00000000-0000-4000-8000-0000000c0e01', last_asked_at: '2026-10-07T00:00:00.000Z' });
    tables.conversations?.push({ id: '00000000-0000-4000-8000-0000000c0e03', household_id: HOUSEHOLD_ID, created_by: '00000000-0000-4000-8000-0000000c0e04', last_asked_at: '2026-10-06T00:00:00.000Z', sdk_session_id: null, sdk_turn_hash: null, sdk_handles: 0 });
    const { worker } = askWorker(tables, tempDir('esta-ask-jobs-'), recordTurns([GOOD]));
    await pollOnce(worker);
    expect(tables.agent_jobs?.[0]).toMatchObject({ status: 'done', error: null });
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
