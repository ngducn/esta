import { isoDate } from '@esta/core/date';
import { describe, expect, it } from 'vitest';
import { reviewedWeek, weekProposals, weeklyReviewRequest } from '../../src/jobs/weekly-review';
import { fakeDb } from '../../src/test/fake-db';
import { askTables } from '../ask-seed';
import { clockOn, HOUSEHOLD } from '../full-seed';
import { readsOn, recordedReads, replayedReads } from '../golden/ask-reads';
import { WEEKLY_AS_OF, weeklyRecording } from '../golden/weekly-fixture';
import { toolCaller } from '../replay-worker';

type Row = Record<string, unknown>;

const STORED = 'https://tintuc.example.vn/ha-tang/vanh-dai-3-doan-qua-di-an-sap-khoi-cong';
const ELSEWHERE = 'https://baodemo.example.vn/gia-thue-phong-tro-di-an';
const recorded = weeklyRecording().toolCalls.map(({ name, input }) => ({ name: name.replace(/^mcp__esta__/, ''), input }));
const reads = recorded.filter(({ name }) => !name.startsWith('create_'));
const [reminder, renewal, rentChange] = recorded.filter(({ name }) => name === 'create_proposal').map(({ input }) => input);
const note = recorded.find(({ name }) => name === 'create_item')?.input ?? {};

function weeklyTables(): Record<string, Row[]> {
  const tables = askTables('');
  tables.research_items = [{ household_id: HOUSEHOLD, url_normalized: STORED, source_url: STORED, title_vi: 'Sắp khởi công Vành đai 3', source_name: 'Tin tức Demo', published_on: '2026-10-05', relevance: 0.9, created_at: '2026-10-06T23:00:00.000Z' }];
  return tables;
}

const W41 = `weekly_review:${HOUSEHOLD}:2026-W41`;

/** One attempt of a weekly job queued under `key`, run on `day`, as the worker prepares it. */
async function weeklyRun(tables: Record<string, Row[]>, { day = '2026-10-11', key = W41, jobId = `job:${key}` }: { day?: string; key?: string; jobId?: string } = {}) {
  const job = { id: jobId, household_id: HOUSEHOLD, kind: 'weekly_review', idempotency_key: key };
  if (!(tables.agent_jobs ?? []).some((row) => row.id === jobId)) (tables.agent_jobs ??= []).push(job);
  const db = fakeDb(tables, [], {}, {}, { proposal_refusal: () => null });
  const prepared = weeklyReviewRequest({
    db,
    householdId: HOUSEHOLD,
    jobId,
    locale: 'vi',
    ...reviewedWeek(job, isoDate(day)),
    earlierProposals: await weekProposals(db, job),
    timezone: 'Asia/Ho_Chi_Minh',
    reads: replayedReads(readsOn(recordedReads(), isoDate(WEEKLY_AS_OF.slice(0, 10)))),
    clock: clockOn(`${day}T08:00:00+07:00`),
  });
  const call = toolCaller(prepared);
  for (const { name, input } of reads) await call(name, input);
  return { prepared, call };
}

const task = (verb: string) => ({ type: 'create_task', params: { title: `${verb} {{f33.property_label}}` }, rationale: '{{f33.property_label}} đang trống.' });

const proposals = (tables: Record<string, Row[]>) => (tables.agent_items ?? []).filter((row) => row.kind === 'proposal');

describe('weekly_review proposals (AGENT.md §5.5)', () => {
  it('makes at most three proposals a run and refuses the fourth', async () => {
    const tables = weeklyTables();
    const { call } = await weeklyRun(tables);
    for (const input of [reminder, renewal, rentChange]) expect((await call('create_proposal', input)).isError).toBe(false);
    const fourth = await call('create_proposal', task('Kiểm tra'));
    expect(fourth).toEqual({ isError: true, text: expect.stringContaining('already made 3 proposals') });
    expect(proposals(tables)).toHaveLength(3);
  });

  it('holds the cap when the model calls create_proposal five times at once', async () => {
    const tables = weeklyTables();
    const { call } = await weeklyRun(tables);
    const answers = await Promise.all(['Kiểm tra', 'Gọi', 'Ghé', 'Xem', 'Sửa'].map((verb) => call('create_proposal', task(verb))));
    expect(answers.filter(({ isError }) => !isError)).toHaveLength(3);
    expect(proposals(tables)).toHaveLength(3);
  });

  it('counts what an earlier attempt of the week stored, so a Thử lại adds only the slots left', async () => {
    const tables = weeklyTables();
    const first = await weeklyRun(tables, { day: '2026-10-11' });
    for (const input of [reminder, renewal]) expect((await first.call('create_proposal', input)).isError).toBe(false);
    const other = await weeklyRun(tables, { day: '2026-10-04', key: `weekly_review:${HOUSEHOLD}:2026-W40` });
    expect((await other.call('create_proposal', rentChange)).isError, 'last week has its own three').toBe(false);

    const retry = await weeklyRun(tables, { day: '2026-10-12', key: `${W41}:retry:1` });
    expect((await retry.call('create_proposal', reminder)).isError, 'a proposal the first attempt stored adds nothing and takes no slot').toBe(false);
    expect((await retry.call('create_proposal', task('Kiểm tra'))).isError).toBe(false);
    expect((await retry.call('create_proposal', task('Gọi'))).text).toContain('already made 3 proposals');
    expect(proposals(tables).filter((row) => row.job_id !== `job:weekly_review:${HOUSEHOLD}:2026-W40`)).toHaveLength(3);
  });

  it('refuses a rent change with no citation, or one citing a page neither fetched in this run nor stored', async () => {
    const tables = weeklyTables();
    const { call } = await weeklyRun(tables);
    const { citations: _, ...uncited } = rentChange ?? {};
    expect((await call('create_proposal', uncited)).text).toMatch(/^citations: a rent change cites the market news it rests on/);
    expect((await call('create_proposal', { ...uncited, citations: [ELSEWHERE] })).text).toContain(`citations: "${ELSEWHERE}" is not a page WebFetch read in this run or a research item recent_items returned`);
    expect(proposals(tables)).toEqual([]);
  });

  it('accepts a citation of a page WebFetch read in this run, by its normalized link', async () => {
    const tables = weeklyTables();
    const { prepared, call } = await weeklyRun(tables);
    prepared.observe?.({ name: 'WebFetch', input: { url: `${ELSEWHERE}?utm_source=zalo`, prompt: 'x' }, result: { code: 200, codeText: 'OK', result: 'Giá thuê phòng trọ Demo tăng.', url: ELSEWHERE } });
    expect((await call('create_proposal', { ...rentChange, citations: [`${ELSEWHERE}/`] })).isError).toBe(false);
    expect(proposals(tables)[0]?.citations).toEqual([{ url: ELSEWHERE, title: null, source_name: 'baodemo.example.vn', published_at: null }]);
  });

  it('names the lease by its handle, and stores the id that handle links to', async () => {
    const tables = weeklyTables();
    const { call } = await weeklyRun(tables);
    await call('create_proposal', reminder);
    expect(proposals(tables)[0]).toMatchObject({ proposal: { type: 'draft_reminder', params: { lease_id: '1809d052-456b-56e2-a238-be56d3234864' } } });
  });
});

describe('the weekly note (AGT-8)', () => {
  it('saves one note per scheduled week: a second attempt adds nothing, a retry after midnight keeps its week, the next Sunday adds its own', async () => {
    const tables = weeklyTables();
    const W42 = `weekly_review:${HOUSEHOLD}:2026-W42`;
    const runs = [
      { day: '2026-10-11', key: W41 },
      { day: '2026-10-11', key: W41 },
      { day: '2026-10-19', key: `${W42}:retry:1` },
      { day: '2026-10-25', key: `weekly_review:${HOUSEHOLD}:2026-W43` },
    ];
    const results: unknown[] = [];
    for (const run of runs) {
      const { prepared, call } = await weeklyRun(tables, run);
      expect((await call('create_item', note)).isError).toBe(false);
      const { iso_week, note: saved } = (await prepared.finish({ reply: 'xong', model: 'm' })) as { iso_week: string; note: { added: boolean } };
      results.push([iso_week, saved.added]);
    }
    expect(results).toEqual([
      ['2026-W41', true],
      ['2026-W41', false],
      ['2026-W42', true],
      ['2026-W43', true],
    ]);
    expect((tables.agent_items ?? []).filter((row) => row.kind === 'weekly').map((row) => row.dedupe_key)).toEqual(['weekly_review:2026-W41', 'weekly_review:2026-W42', 'weekly_review:2026-W43']);
  });

  it('dates a retried week by its Sunday, and a week still running by today', () => {
    expect(reviewedWeek({ idempotency_key: `weekly_review:${HOUSEHOLD}:2026-W42:retry:1` }, isoDate('2026-10-19'))).toEqual({ week: '2026-W42', asOf: '2026-10-18' });
    expect(reviewedWeek({ idempotency_key: `weekly_review:${HOUSEHOLD}:2026-W42` }, isoDate('2026-10-18'))).toEqual({ week: '2026-W42', asOf: '2026-10-18' });
    expect(reviewedWeek({ idempotency_key: null }, isoDate('2026-10-14'))).toEqual({ week: '2026-W42', asOf: '2026-10-14' });
  });

  it('saves one note when the model calls create_item twice at once', async () => {
    const tables = weeklyTables();
    const { call } = await weeklyRun(tables);
    const answers = await Promise.all([call('create_item', note), call('create_item', note)]);
    expect(answers.map(({ isError }) => isError).toSorted()).toEqual([false, true]);
    expect((tables.agent_items ?? []).filter((row) => row.kind === 'weekly')).toHaveLength(1);
  });

  it('refuses a second note in one run, a link to a handle no tool returned, and fails a run that saved no note', async () => {
    const { prepared, call } = await weeklyRun(weeklyTables());
    await expect(prepared.finish({ reply: 'xong', model: 'm' })).rejects.toThrow('The model ended without saving the weekly note');
    expect((await call('create_item', { ...note, body_md: 'Xem [bảng thu tiền](f999).' })).text).toMatch(/^f999: not a record with a link/);
    await call('create_item', note);
    expect((await call('create_item', note)).text).toBe('This run already saved the weekly note.');
  });
});
