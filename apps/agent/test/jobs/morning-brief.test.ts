import { noteRelated } from '@esta/core/assistant';
import { isoDate } from '@esta/core/date';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { morningBriefRequest } from '../../src/jobs/morning-brief';
import { JOBS } from '../../src/jobs/registry';
import { pollOnce } from '../../src/runner';
import { fakeDb } from '../../src/test/fake-db';
import { NumberGuardError } from '../../src/tools/create-item';
import { clockOn, HOUSEHOLD, labels, seedRecords, snapshot } from '../full-seed';
import { replayWorker, toolCaller } from '../replay-worker';
import { storedResearch } from '../research-seed';

type Row = Record<string, unknown>;

const TODAY = '2026-10-07';
const jobsDir = mkdtempSync(join(tmpdir(), 'esta-brief-jobs-'));
afterAll(() => rmSync(jobsDir, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

const tablesWith = (agentJobs: Row[] = []): Record<string, Row[]> => ({
  agent_jobs: agentJobs,
  agent_items: [],
  agent_runs: [],
  households: [{ id: HOUSEHOLD, name: 'Gia đình Demo', locale: 'vi' }],
  ...seedRecords(),
});

function request(tables: Record<string, Row[]>, waiting: readonly string[] = [], clock = clockOn(`${TODAY}T07:00:00+07:00`)) {
  return morningBriefRequest({ db: fakeDb(tables), householdId: HOUSEHOLD, jobId: 'job-brief', locale: 'vi', asOf: isoDate(TODAY), timezone: 'Asia/Ho_Chi_Minh', clock, waiting, failed: [], read: async () => ({ snapshot, labels }) });
}

const daily = (kind: string, patch: Row = {}): Row => ({
  id: `job-${kind}`,
  household_id: HOUSEHOLD,
  kind,
  status: 'queued',
  run_after: '2026-10-07T00:00:00.000Z',
  attempts: 0,
  max_attempts: 4,
  payload: {},
  idempotency_key: `${kind}:${HOUSEHOLD}:${TODAY}`,
  ...patch,
});

function stack(inputs: Row[]) {
  let now = `${TODAY}T07:00:00+07:00`;
  const clock = () => clockOn(now)();
  const brief = daily('morning_brief');
  const tables = tablesWith([brief, ...inputs]);
  const worker = replayWorker(fakeDb(tables), tables.agent_jobs ?? [], jobsDir, clock);
  vi.spyOn(JOBS.morning_brief.handler, 'prepare').mockImplementation(async ({ db, job, waiting, failed }) =>
    morningBriefRequest({ db, householdId: HOUSEHOLD, jobId: job.id, locale: 'vi', asOf: isoDate(TODAY), timezone: 'Asia/Ho_Chi_Minh', clock, waiting, failed, read: async () => ({ snapshot, labels }) }),
  );
  vi.spyOn(console, 'log').mockImplementation(() => undefined);
  return { brief, tables, worker, at: (time: string) => (now = `${TODAY}T${time}:00+07:00`) };
}

const body = (tables: Record<string, Row[]>) => String(tables.agent_items?.find((item) => item.kind === 'brief')?.body_md ?? '');

describe('morning_brief waits for its inputs (AGENT.md §3)', () => {
  it('waits for a queued portfolio_watch 5 minutes at a time, three times, then writes the brief with one line naming it', async () => {
    const { brief, tables, worker, at } = stack([daily('portfolio_watch', { run_after: '2026-10-08T00:00:00.000Z' })]);
    for (const [time, next] of [
      ['07:00', '2026-10-07T00:05:00.000Z'],
      ['07:05', '2026-10-07T00:10:00.000Z'],
      ['07:10', '2026-10-07T00:15:00.000Z'],
    ] as const) {
      at(time);
      expect(await pollOnce(worker)).toBe(true);
      expect(brief).toMatchObject({ status: 'queued', run_after: next, attempts: 0, locked_by: null });
    }
    expect(brief.payload).toEqual({ reschedules: 3 });
    at('07:14');
    expect(await pollOnce(worker), 'nothing is due before 07:15').toBe(false);

    at('07:15');
    expect(await pollOnce(worker)).toBe(true);
    expect(brief).toMatchObject({ status: 'done', attempts: 1, result: expect.objectContaining({ missing_inputs: ['portfolio_watch'] }) });
    expect(body(tables)).toMatch(/\*\*Còn thiếu\*\*\n\n- Ghi chú theo dõi sáng nay chưa xong\.$/);
    expect(body(tables).match(/^- /gm)).toHaveLength(9);
  });

  it('waits for a queued research_scan the same way, and names the market news when it goes without it', async () => {
    const { brief, tables, worker, at } = stack([daily('research_scan', { run_after: '2026-10-08T00:00:00.000Z' })]);
    expect(await pollOnce(worker)).toBe(true);
    expect(brief).toMatchObject({ status: 'queued', run_after: '2026-10-07T00:05:00.000Z', payload: { reschedules: 1 } });
    brief.payload = { reschedules: 3 };
    at('07:05');
    expect(await pollOnce(worker)).toBe(true);
    expect(brief).toMatchObject({ status: 'done', result: expect.objectContaining({ missing_inputs: ['research_scan'] }) });
    expect(body(tables)).toMatch(/\*\*Còn thiếu\*\*\n\n- Tin thị trường hôm nay chưa có\.$/);
  });

  it('names a research_scan that failed for good, and runs at once', async () => {
    const { brief, tables, worker } = stack([daily('research_scan', { status: 'failed' }), daily('portfolio_watch', { status: 'done' })]);
    expect(await pollOnce(worker)).toBe(true);
    expect(brief).toMatchObject({ status: 'done', payload: {}, result: expect.objectContaining({ missing_inputs: ['research_scan'] }) });
    expect(body(tables)).toMatch(/\*\*Còn thiếu\*\*\n\n- Hôm nay Trợ lý không tìm được tin thị trường\.$/);
  });

  it('names a portfolio_watch that failed for good, and runs at once (#321)', async () => {
    const { brief, tables, worker } = stack([daily('portfolio_watch', { status: 'failed' }), daily('research_scan', { status: 'done' })]);
    expect(await pollOnce(worker)).toBe(true);
    expect(brief).toMatchObject({ status: 'done', payload: {}, result: expect.objectContaining({ missing_inputs: ['portfolio_watch'] }) });
    expect(body(tables)).toMatch(/\*\*Còn thiếu\*\*\n\n- Ghi chú theo dõi sáng nay không chạy được\.$/);
  });

  it('runs at once when the day’s portfolio_watch is done', async () => {
    const { brief, worker } = stack([daily('portfolio_watch', { status: 'done' })]);
    expect(await pollOnce(worker)).toBe(true);
    expect(brief).toMatchObject({ status: 'done', payload: {} });
  });
});

const line = (text: string, related: string[]) => ({ text, related });
const TODO = [
  line('{{f1.place_label}} quá hạn {{f1.days_overdue_display}}', ['f1']),
  line('Hợp đồng {{f2.place_label}} sắp hết hạn', ['f2']),
  line('{{f6.place_label}} chưa hoàn cọc', ['f6']),
];
const WATCH = [line('Để trống: {{f3.place_label}} và {{f4.place_label}}', ['f3', 'f4']), line('{{f5.document_label}} sắp hết hạn', ['f5']), line('Thuế của {{f7.owner_name}}', ['f7'])];
const draft = (patch: Row = {}) => ({ summary: 'Sáng nay có việc cần làm.', todo: TODO, watch: WATCH, ...patch });

function tools(tables = tablesWith()) {
  const prepared = request(tables);
  return { tables, prepared, call: toolCaller(prepared) };
}

describe('create_brief', () => {
  it('saves the brief once a repair turn fixes a typed number, and refuses a second brief', async () => {
    const { tables, call } = tools();
    await call('watch_facts');
    const first = await call('create_brief', draft({ summary: 'Có 3 việc cần làm.' }));
    expect(first).toEqual({ text: expect.stringContaining('"3": Do not type a number.'), isError: true });
    expect(tables.agent_items).toEqual([]);
    expect((await call('create_brief', draft())).isError).toBe(false);
    expect(tables.agent_items?.[0]).toMatchObject({ kind: 'brief', severity: 'action', audience: 'all', title: 'Sáng nay có việc cần làm.' });
    const related = noteRelated(tables.agent_items?.[0]?.related);
    expect(related.facts.map(({ rule_id }) => rule_id), 'every fact a line tells').toEqual(['W1', 'W3', 'W6', 'W4', 'W4', 'W5', 'W7']);
    expect(related.links, 'one record per line, the first fact’s').toHaveLength(6);
    expect((await call('create_brief', draft())).text).toMatch(/^This run already saved the brief/);
  });

  it('fails with number_guard on a second violation, leaving one operator note and no brief', async () => {
    const { tables, call } = tools();
    await call('watch_facts');
    await call('create_brief', draft({ summary: 'Có ba việc.' }));
    await expect(call('create_brief', draft({ summary: 'Có hai việc.' }))).rejects.toBeInstanceOf(NumberGuardError);
    expect(tables.agent_items).toEqual([expect.objectContaining({ kind: 'system', audience: 'operator', dedupe_key: 'number_guard:job-brief' })]);
    expect(String(tables.agent_items?.[0]?.body_md)).toContain('Có hai việc.');
  });

  it('names an action fact left out while the todo list has room, and a fact no tool returned', async () => {
    const { call } = tools();
    await call('watch_facts');
    expect((await call('create_brief', draft({ todo: TODO.slice(0, 2) }))).text).toContain('f6 (W6): an action fact; give it a line under todo.');
    expect((await call('create_brief', draft({ watch: WATCH.slice(1) }))).text).toContain('f3 (W4): a watch fact; give it a line under watch.');
    expect((await call('create_brief', draft({ todo: [...TODO, line('Khác', ['f12'])] }))).text).toMatch(/^f12: not a fact a tool returned/);
  });

  it('asks for a shorter brief over 300 words', async () => {
    const { call } = tools();
    await call('watch_facts');
    const long = 'chữ '.repeat(60).trim();
    const answer = await call('create_brief', draft({ watch: [...WATCH, line(long, ['f8']), line(long, ['f8'])], todo: TODO.map((entry) => ({ ...entry, text: `${entry.text} ${long}` })) }));
    expect(answer.text).toMatch(/words > 300\. Shorten the brief\./);
  });

  it('fails the job when a line would link to a record the household no longer has', async () => {
    const tables = tablesWith();
    tables.invoices = [];
    const { call } = tools(tables);
    await call('watch_facts');
    await expect(call('create_brief', draft())).rejects.toThrow(/links to records the household does not have: esta:\/\/invoice\//);
    expect(tables.agent_items).toEqual([]);
  });

  it('adds today’s three most relevant research items of 0.6 or more under Thị trường, each with its source chip', async () => {
    const tables = tablesWith();
    tables.research_items = storedResearch(HOUSEHOLD);
    const { call } = tools(tables);
    await call('watch_facts');
    expect((await call('create_brief', draft())).isError).toBe(false);
    expect(body(tables).split('**Thị trường**\n\n')[1]).toBe(
      [
        '- Sắp khởi công Vành đai 3 đoạn qua Phường Dĩ An [Tin tức Demo · 05/10/2026](<https://tintuc.example.vn/vanh-dai-3>)',
        '- Hướng dẫn mới về khai thuế cho thuê nhà có hiệu lực từ 15/11/2026 [Tin tức Demo · 05/10/2026](<https://tintuc.example.vn/khai-thue>)',
        '- TP. Đồng Nai điều chỉnh bảng giá đất, áp dụng từ 01/01/2027 [Tin tức Demo · 05/10/2026](<https://tintuc.example.vn/bang-gia-dat>)',
      ].join('\n'),
    );
  });

  it('answers the same facts under the same handles when watch_facts is called twice', async () => {
    const { call } = tools();
    const [first, second] = [await call('watch_facts'), await call('watch_facts')];
    expect(second.text).toBe(first.text);
  });

  it('saves the sanitize case after the guard refuses its <b> tag, with its HTML and http link as escaped text', async () => {
    const recording = JSON.parse(readFileSync(join(import.meta.dirname, '../../../../fixtures/agent-replay-cases/brief-html/morning_brief/e4d91aefa2f5ee62d000dc44bca59ab828b5e07243fbca37e6317004959e98fd.json'), 'utf8')) as { toolCalls: Array<{ name: string; input: Record<string, unknown> }> };
    const { tables, call } = tools();
    const answers = [];
    for (const { name, input } of recording.toolCalls) answers.push(await call(name.replace('mcp__esta__', ''), input));
    expect(answers.map((answer) => answer.isError)).toEqual([false, false, true, false]);
    const shown = body(tables).split('\n').find((text) => text.includes('onclick')) ?? '';
    expect(shown).toContain('\\<strong onclick');
    expect(shown).toContain('\\[bấm đây\\](http://evil.test/pay)');
  });

  it('fails the job when the model ends without saving the brief', async () => {
    const { prepared, call } = tools();
    await call('watch_facts');
    await expect(prepared.finish({ reply: 'xong', model: 'test' })).rejects.toThrow(/without saving the brief/);
  });
});
