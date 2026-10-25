import { isoDate } from '@esta/core/date';
import { formatBps, formatDate, formatVnd } from '@esta/core/format';
import { vnd } from '@esta/core/money';
import { existingLinks } from '@esta/ops';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { askRequest } from '../../src/jobs/ask';
import { JOBS } from '../../src/jobs/registry';
import { canonicalizer } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, readRecording } from '../../src/replay/store';
import { replaySession } from '../../src/sdk/session';
import { fakeDb } from '../../src/test/fake-db';
import { ANSWER, answerRow, askRpcs, askTables, CONVERSATION, QUESTION, withDraftAndArchivedLeases } from '../ask-seed';
import { clockOn, HOUSEHOLD, seedRecords } from '../full-seed';
import { askCase as findCase, askRecording, ASK_CASES, ASK_CONTEXT, caseEarlier, caseInput } from './ask-cases';
import { ASK_READS_FIXTURE, replayedReads } from './ask-reads';

const truth = JSON.parse(readFileSync(join(import.meta.dirname, 'ask-ground-truth.json'), 'utf8')) as Array<{ question: string; figure: string; value: string }>;
const fact = (question: string, figure: string) => {
  const row = truth.find((candidate) => candidate.question === question && candidate.figure === figure);
  if (row === undefined) throw new Error(`ask-ground-truth.sql has no ${question} ${figure}`);
  return row.value;
};
const money = (question: string, figure: string) => formatVnd(vnd(Number(fact(question, figure))), 'vi');
const day = (question: string, figure: string) => formatDate(isoDate(fact(question, figure)), 'vi');

const jobDir = mkdtempSync(join(tmpdir(), 'esta-ask-golden-'));
afterAll(() => rmSync(jobDir, { recursive: true, force: true }));

const LINK = /\]\((esta:\/\/[^)]+)\)/g;
const links = (markdown: string) => [...markdown.matchAll(LINK)].map(([, link]) => link ?? '');
/** The answer with each link target cut to its type, since record ids are the seed's, not the ground truth's. */
const shown = (markdown: string) => markdown.replace(LINK, (_, link: string) => `](${link.replace(/\/[0-9a-f-]{36}$/, '/…')})`);

const EARLIER = { question: '00000000-0000-4000-8000-0000000c0a12', answer: '00000000-0000-4000-8000-0000000c0a13' };

/** Runs the case, after the case it follows in the same session directory, as her conversation ran them. */
async function ask(id: string, reads = replayedReads()): Promise<Asked> {
  const askCase = findCase(id);
  const before = askCase.follows === undefined ? null : await ask(askCase.follows.id, reads);
  const tables = askTables(askCase.question);
  if (before !== null && askCase.follows !== undefined) {
    const earlier = { household_id: HOUSEHOLD, conversation_id: CONVERSATION, status: 'done' };
    tables.messages?.unshift({ ...earlier, id: EARLIER.question, role: 'user', content_md: findCase(askCase.follows.id).question }, { ...earlier, id: EARLIER.answer, role: 'assistant', content_md: before.answer.content_md, refs: before.answer.refs });
  }
  const asOf = isoDate('2026-10-07');
  const prepared = askRequest({
    db: fakeDb(tables, [], {}, {}, askRpcs(tables)),
    householdId: HOUSEHOLD,
    jobId: `golden-${id}`,
    conversationId: CONVERSATION,
    questionId: QUESTION,
    answerId: ANSWER,
    locale: 'vi',
    asOf,
    timezone: ASK_CONTEXT.timezone,
    question: askCase.question,
    earlier: caseEarlier(askCase),
    deep: askCase.deep === true,
    reads,
    clock: clockOn('2026-10-07T07:00:00+07:00'),
  });
  const rebuilt = askCase.rebuiltFrom === undefined ? null : await prepared.rebuild?.();
  if (rebuilt === undefined) throw new Error(`${id} has no session to rebuild`);
  const run = await replaySession(
    {
      spec: JOBS.ask,
      prompt: rebuilt ?? prepared.prompt,
      jobDir,
      configDir: jobDir,
      tools: prepared.tools,
      canon: canonicalizer({ householdName: 'Gia đình Demo', jobDir }),
      ...(prepared.onText === undefined ? {} : { onText: prepared.onText }),
      ...(prepared.resume === undefined || rebuilt !== null ? {} : { resume: prepared.resume }),
      ...(prepared.modelRole === undefined ? {} : { modelRole: prepared.modelRole }),
    },
    DEFAULT_REPLAY_DIR,
  );
  const repair = await prepared.nextTurn?.();
  const result = (await prepared.finish({ reply: run.result.text, model: run.model, sessionId: run.result.sessionId, turnHash: 'a'.repeat(64) })) as { cited: Array<{ placeholder: string; value: string }> };
  const answer = answerRow(tables);
  const present = await existingLinks(fakeDb(seedRecords()), HOUSEHOLD, links(answer.content_md));
  return { answer, repair, result, run, conversation: tables.conversations?.[0], missing: links(answer.content_md).filter((link) => !present.has(link)) };
}

type Asked = {
  readonly answer: ReturnType<typeof answerRow>;
  readonly repair: string | null | undefined;
  readonly result: { cited: Array<{ placeholder: string; value: string }> };
  readonly run: Awaited<ReturnType<typeof replaySession>>;
  readonly conversation: Record<string, unknown> | undefined;
  readonly missing: string[];
};

const EXPECTED: Readonly<Record<string, () => string>> = {
  'q1-di-an-income': () => `Từ đầu tháng 10/2026 đến nay, Dãy trọ Dĩ An đã thu ${money('q1', 'di-an income received in October 2026')} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của Dãy trọ Dĩ An](esta://ledger/…).`,
  'q1-deep': () => `Từ đầu tháng 10/2026 đến nay, Dãy trọ Dĩ An đã thu ${money('q1', 'di-an income received in October 2026')} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của Dãy trọ Dĩ An](esta://ledger/…).`,
  'q1-follow-up-september': () => `Tháng 9/2026, Dãy trọ Dĩ An đã thu ${money('q1', 'di-an income received in September 2026')} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của Dãy trọ Dĩ An](esta://ledger/…).`,
  'q1-follow-up-september-rebuilt': () => `Tháng 9/2026, Dãy trọ Dĩ An đã thu ${money('q1', 'di-an income received in September 2026')} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của Dãy trọ Dĩ An](esta://ledger/…).`,
  'q2-di-an-overdue': () =>
    `Ở Dãy trọ Dĩ An, chỉ có ${fact('q2', 'di-an units overdue')} đang quá hạn đóng tiền: quá hạn ${fact('q2', 'di-an days overdue')} ngày, còn nợ ${money('q2', 'di-an amount overdue')}.\n\nXem [hóa đơn của ${fact('q2', 'di-an units overdue')}](esta://invoice/…).`,
  'q3-leases-ending': () =>
    `Trong thời gian đó có một hợp đồng hết hạn:\n\n| Tài sản | Người thuê | Ngày hết hạn | Còn lại |\n| --- | --- | --- | --- |\n| [${fact('q3', 'leases ending within 60 days')}](esta://lease/…) | Phạm Thị Lan Demo | ${day('q3', 'their end dates')} | ${fact('q3', 'their days left')} ngày |`,
  'q4-deposits-held': () => `Gia đình đang giữ tổng cộng ${money('q4', 'deposits held')} tiền cọc của người thuê, tính cả tiền cọc của hợp đồng đã kết thúc mà chưa hoàn lại.`,
  'q5-tax-threshold': () =>
    `Năm 2026, doanh thu cho thuê tính cho Nguyễn Thị Demo đến nay là ${money('q5', 'Nguyễn Thị Demo accrued 2026')}, dự kiến cả kỳ là ${money('q5', 'Nguyễn Thị Demo projected 2026')}.\n\nSo với ngưỡng ${formatVnd(vnd(500_000_000), 'vi')}, doanh thu dự kiến còn cách ${money('q5', 'remaining to the 500 million threshold')} và đã đạt 96,53% ngưỡng. Xem [thông tin thuế của Nguyễn Thị Demo](esta://party/…).`,
  'q6-bien-hoa-vacant': () => `Kho Biên Hòa đã để trống ${fact('q6', 'bien-hoa days empty')} ngày, từ ngày ${day('q6', 'bien-hoa empty since')}.\n\nXem [hồ sơ Kho Biên Hòa](esta://property/…).`,
  'q7-q7-repairs': () => `Năm 2026, chi phí sửa chữa của Nhà phố Q7 là ${money('q7', 'q7 repairs paid in 2026')}.\n\nXem từng khoản trong [sổ thu chi của Nhà phố Q7](esta://ledger/…).`,
  'q8-bao-loc-mortgage': () =>
    `Có. Sổ của Đất Bảo Lộc đang thế chấp tại ${fact('q8', 'bao-loc mortgage bank')}, khoản vay ${money('q8', 'bao-loc mortgage amount')}, đăng ký ngày 12/03/2024.\n\nXem [pháp lý của Đất Bảo Lộc](esta://legal/…).`,
  'q9-q1-yield': () =>
    `Lợi suất cho thuê gộp của Mặt bằng Quận 1 là ${formatBps(Number(fact('q9', 'q1 gross yield bp')), 'vi')}. Con số này tính trên tiền thuê hằng tháng ${formatVnd(vnd(2_500_000), 'vi')} và giá trị ước tính ${formatVnd(vnd(7_200_000_000), 'vi')} ngày 01/07/2026.\n\nXem [hồ sơ Mặt bằng Quận 1](esta://property/…).`,
  'q10-late-tenant-english': () =>
    `${fact('q10', 'tenant who paid late most often')} paid late most often this year: ${fact('q10', 'their bills paid late')} of ${fact('q10', 'their bills')} bills were paid in full after their due date, on average ${fact('q10', 'their average days late')} days late.\n\nSee [${fact('q10', 'tenant who paid late most often')}](esta://party/…).`,
  'seed10-english-overdue': () =>
    `In Dãy trọ Dĩ An, only ${fact('q2', 'di-an units overdue')} is overdue: ${fact('q2', 'di-an days overdue')} days late, with ${money('q2', 'di-an amount overdue')} still owed.\n\nSee [the bill for ${fact('q2', 'di-an units overdue')}](esta://invoice/…).`,
};

describe('ask in replay on the full seed at 2026-10-07 07:00 (AGENT.md §7.4, AGT-7)', () => {
  it.each(ASK_CASES)('$id has its committed hand-written recording', (askCase) => {
    const { input, ...recording } = askRecording(askCase);
    expect(readRecording(DEFAULT_REPLAY_DIR, caseInput(askCase))).toEqual({ input, ...recording });
  });

  it.each(Object.keys(EXPECTED))('%s states the ground truth with every link resolving, guarded on the first turn', async (id) => {
    const { answer, repair, missing } = await ask(id);
    expect(repair).toBeNull();
    expect(answer.status).toBe('done');
    expect(shown(answer.content_md)).toBe(EXPECTED[id]?.());
    expect(answer.refs).toEqual([...new Set(links(answer.content_md))]);
    expect(missing).toEqual([]);
  });

  it.each(['q4-deposits-held'])('%s still states the ground truth beside a draft lease and an archived property\'s lease', async (id) => {
    const recorded = JSON.parse(readFileSync(ASK_READS_FIXTURE, 'utf8')) as Record<string, unknown>;
    const { answer } = await ask(id, replayedReads(withDraftAndArchivedLeases(recorded)));
    expect(shown(answer.content_md)).toBe(EXPECTED[id]?.());
  });

  it('cites question 1 income from the ledger tool, so the figure is the tool value and not typed', async () => {
    const { result } = await ask('q1-di-an-income');
    expect(result.cited.filter(({ placeholder }) => placeholder.endsWith('income_display}}')).map(({ value }) => value)).toEqual([money('q1', 'di-an income received in October 2026')]);
  });

  it('question 1 hands out eight handles, so its follow-up starts at f9 and resumes question 1\'s turn', async () => {
    const first = await ask('q1-di-an-income');
    expect(first.conversation).toMatchObject({ sdk_handles: 8, sdk_session_id: first.run.result.sessionId });
    const followUp = findCase('q1-follow-up-september');
    expect(followUp.follows?.firstHandle).toBe(9);
    expect(caseInput(followUp).resumesInputHash).toBe(askRecording(findCase('q1-di-an-income')).inputHash);
  });

  it('the follow-up cites September from the ledger, reading the property and month from the session it resumed', async () => {
    const { result, run } = await ask('q1-follow-up-september');
    expect(run.toolCalls.map(({ name }) => name.replace(/^mcp__esta__/, ''))).toEqual(['list_properties', 'ledger']);
    expect(result.cited.filter(({ placeholder }) => placeholder.endsWith('income_display}}')).map(({ value }) => value)).toEqual([money('q1', 'di-an income received in September 2026')]);
  });

  it('an operator\'s deep ask replays its own recording, made with the deep model', async () => {
    const { run } = await ask('q1-deep');
    expect(run.model).toBe('hand-written-deep');
    expect(caseInput(findCase('q1-deep')).modelRole).toBe('deep');
  });

  it('a question the tools cannot answer says the app has no such data and cites no figure', async () => {
    const { answer, result } = await ask('missing-market-price');
    expect(answer.status).toBe('done');
    expect(answer.content_md).toContain('Ứng dụng chưa có giá thị trường hiện nay của Đất Bảo Lộc');
    expect(result.cited.map(({ placeholder }) => placeholder)).toEqual(['{{f1.property_label}}']);
    expect(answer.content_md).not.toMatch(/\p{N}/u);
  });
});
