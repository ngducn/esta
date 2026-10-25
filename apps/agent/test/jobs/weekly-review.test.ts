import { isoDate } from '@esta/core/date';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { weeklyReviewRequest } from '../../src/jobs/weekly-review';
import { fakeDb } from '../../src/test/fake-db';
import { askTables } from '../ask-seed';
import { clockOn, HOUSEHOLD } from '../full-seed';
import { replayedReads, type RecordedReads } from '../golden/ask-reads';
import { weeklyRecording, WEEKLY_READS_FIXTURE } from '../golden/weekly-fixture';
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

/** A weekly run on `day` that has made the recording's reads, so the handles its writes name exist. */
async function weeklyRun(tables: Record<string, Row[]>, day = '2026-10-11') {
  const prepared = weeklyReviewRequest({
    db: fakeDb(tables, [], {}, {}, { proposal_refusal: () => null }),
    householdId: HOUSEHOLD,
    jobId: `job-weekly-${day}`,
    locale: 'vi',
    asOf: isoDate(day),
    timezone: 'Asia/Ho_Chi_Minh',
    reads: replayedReads(JSON.parse(readFileSync(WEEKLY_READS_FIXTURE, 'utf8')) as RecordedReads),
    clock: clockOn(`${day}T08:00:00+07:00`),
  });
  const call = toolCaller(prepared);
  for (const { name, input } of reads) await call(name, input);
  return { prepared, call };
}

const proposals = (tables: Record<string, Row[]>) => (tables.agent_items ?? []).filter((row) => row.kind === 'proposal');

describe('weekly_review proposals (AGENT.md §5.5)', () => {
  it('makes at most three proposals a run and refuses the fourth', async () => {
    const tables = weeklyTables();
    const { call } = await weeklyRun(tables);
    for (const input of [reminder, renewal, rentChange]) expect((await call('create_proposal', input)).isError).toBe(false);
    const fourth = await call('create_proposal', { type: 'create_task', params: { title: 'Kiểm tra {{f33.property_label}}', property_id: 'f2' }, rationale: '{{f33.property_label}} đang trống.' });
    expect(fourth).toEqual({ isError: true, text: expect.stringContaining('already made 3 proposals') });
    expect(proposals(tables)).toHaveLength(3);
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
  it('saves one note per ISO week: a second run that week adds nothing, the next week adds its own', async () => {
    const tables = weeklyTables();
    const added: unknown[] = [];
    for (const day of ['2026-10-11', '2026-10-11', '2026-10-12']) {
      const { prepared, call } = await weeklyRun(tables, day);
      expect((await call('create_item', note)).isError).toBe(false);
      added.push(((await prepared.finish({ reply: 'xong', model: 'm' })) as { note: { added: boolean } }).note.added);
    }
    expect(added).toEqual([true, false, true]);
    expect((tables.agent_items ?? []).filter((row) => row.kind === 'weekly').map((row) => row.dedupe_key)).toEqual(['weekly_review:2026-W41', 'weekly_review:2026-W42']);
  });

  it('refuses a second note in one run, a link to a handle no tool returned, and fails a run that saved no note', async () => {
    const { prepared, call } = await weeklyRun(weeklyTables());
    await expect(prepared.finish({ reply: 'xong', model: 'm' })).rejects.toThrow('The model ended without saving the weekly note');
    expect((await call('create_item', { ...note, body_md: 'Xem [bảng thu tiền](f999).' })).text).toMatch(/^f999: not a record with a link/);
    await call('create_item', note);
    expect((await call('create_item', note)).text).toBe('This run already saved the weekly note.');
  });
});
