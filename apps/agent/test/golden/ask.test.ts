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
import { askPrompt } from '../../src/prompts/ask';
import { canonicalizer } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, readRecording } from '../../src/replay/store';
import { canonicalInput, replaySession } from '../../src/sdk/session';
import { fakeDb } from '../../src/test/fake-db';
import { ANSWER, answerRow, askTables, withDraftAndArchivedLeases } from '../ask-seed';
import { clockOn, HOUSEHOLD, seedRecords } from '../full-seed';
import { askRecording, ASK_CASES, ASK_CONTEXT } from './ask-cases';
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

async function ask(id: string, reads = replayedReads()) {
  const askCase = ASK_CASES.find((candidate) => candidate.id === id);
  if (askCase === undefined) throw new Error(`no case ${id}`);
  const tables = askTables(askCase.question);
  const asOf = isoDate('2026-10-07');
  const prepared = askRequest({
    db: fakeDb(tables),
    householdId: HOUSEHOLD,
    jobId: `golden-${id}`,
    answerId: ANSWER,
    locale: 'vi',
    asOf,
    timezone: ASK_CONTEXT.timezone,
    question: askCase.question,
    reads,
    clock: clockOn('2026-10-07T07:00:00+07:00'),
  });
  const run = await replaySession(
    { spec: JOBS.ask, prompt: prepared.prompt, jobDir, configDir: jobDir, tools: prepared.tools, canon: canonicalizer({ householdName: 'Gia đình Demo', jobDir }), ...(prepared.onText === undefined ? {} : { onText: prepared.onText }) },
    DEFAULT_REPLAY_DIR,
  );
  const repair = await prepared.nextTurn?.();
  const result = (await prepared.finish({ reply: run.result.text, model: run.model })) as { cited: Array<{ placeholder: string; value: string }> };
  const answer = answerRow(tables);
  const present = await existingLinks(fakeDb(seedRecords()), HOUSEHOLD, links(answer.content_md));
  return { answer, repair, result, missing: links(answer.content_md).filter((link) => !present.has(link)) };
}

const EXPECTED: Readonly<Record<string, () => string>> = {
  'q1-di-an-income': () => `Từ đầu tháng 10/2026 đến nay, Dãy trọ Dĩ An đã thu ${money('q1', 'di-an income received in October 2026')} tiền thuê.\n\nXem từng khoản trong [sổ thu chi của Dãy trọ Dĩ An](esta://ledger/…).`,
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
    expect(readRecording(DEFAULT_REPLAY_DIR, canonicalInput({ spec: JOBS.ask, prompt: askPrompt({ ...ASK_CONTEXT, question: askCase.question }), canon: canonicalizer({ householdName: 'Gia đình Demo' }) }))).toEqual({ input, ...recording });
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

  it('a question the tools cannot answer says the app has no such data and cites no figure', async () => {
    const { answer, result } = await ask('missing-market-price');
    expect(answer.status).toBe('done');
    expect(answer.content_md).toContain('Ứng dụng chưa có giá thị trường hiện nay của Đất Bảo Lộc');
    expect(result.cited.map(({ placeholder }) => placeholder)).toEqual(['{{f1.property_label}}']);
    expect(answer.content_md).not.toMatch(/\p{N}/u);
  });
});
