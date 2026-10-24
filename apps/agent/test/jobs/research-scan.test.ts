import { isoDate } from '@esta/core';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { JOBS } from '../../src/jobs/registry';
import { pollOnce } from '../../src/runner';
import { decideToolUse, toolCaps } from '../../src/sdk/path-policy';
import { fakeDb } from '../../src/test/fake-db';
import { NumberGuardError } from '../../src/tools/create-item';
import { listPropertiesTool } from '../../src/tools/list-properties';
import { syncResearchTopics } from '../../src/tools/research-topics';
import { runSheet } from '../../src/tools/fact-sheet';
import { clockOn } from '../full-seed';
import { replayWorker, toolCaller } from '../replay-worker';
import { RESEARCH_HOUSEHOLD, researchTables, scanRequest, withTitleCheck } from '../research-seed';

type Row = Record<string, unknown>;

const jobsDir = mkdtempSync(join(tmpdir(), 'esta-research-jobs-'));
afterAll(() => rmSync(jobsDir, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

const PAGE = 'https://tintuc.example.vn/vanh-dai-3';
const PAGE_TEXT = 'Bài Demo đăng ngày 05/10/2026: Vành đai 3 đoạn qua Dĩ An sẽ khởi công tháng 12/2026.';

const item = (patch: Row = {}): Row => ({
  source_url: PAGE,
  source_name: 'Tin tức Demo',
  published_on: '2026-10-05',
  effective_on: null,
  kind: 'infrastructure',
  relevance: 0.9,
  title_vi: 'Sắp khởi công {{f0.quote_1_label}} qua {{f18.commune_name}}',
  summary_vi: 'Theo bài ngày {{f0.published_display}}, {{f0.quote_1_label}} sẽ khởi công.',
  why_it_matters_vi: '{{f18.property_label}} ở gần tuyến đường.',
  topics: ['f2'],
  properties: ['f18'],
  quotes: ['Vành đai 3'],
  ...patch,
});

/** A prepared scan whose tools have read the topics and properties, with `pages` already fetched in this run. */
async function scan(options: { pages?: Record<string, string>; similarity?: number; overrides?: Parameters<typeof scanRequest>[1] } = {}) {
  const tables = researchTables();
  const db = withTitleCheck(fakeDb(tables), tables);
  if (options.similarity !== undefined) Object.assign(db, { rpc: async () => ({ data: options.similarity, error: null }) });
  const prepared = scanRequest(db, options.overrides);
  for (const [url, result] of Object.entries(options.pages ?? { [PAGE]: PAGE_TEXT })) prepared.observe?.({ name: 'WebFetch', input: { url, prompt: 'x' }, result: { code: 200, codeText: 'OK', result, url, bytes: 1, durationMs: 1 } });
  const call = toolCaller(prepared);
  await call('research_topics');
  await call('list_properties');
  return { tables, prepared, call, items: () => tables.research_items ?? [] };
}

describe('the web caps in the PreToolUse policy (AGENT.md §5.2)', () => {
  it('allows each web tool up to its cap, then denies it, and refuses a fetch that is not one https page', () => {
    const policy = { allowed: new Set(['WebSearch', 'WebFetch']), jobDir: '/jobs/x', caps: toolCaps({ WebSearch: 2, WebFetch: 1 }) };
    const search = () => decideToolUse(policy, 'WebSearch', { query: 'quy hoạch Dĩ An' }).allow;
    expect([search(), search(), search()]).toEqual([true, true, false]);
    expect(decideToolUse(policy, 'WebFetch', { url: 'http://example.vn/a' })).toEqual({ allow: false, reason: 'WebFetch reads one https page' });
    expect(decideToolUse(policy, 'WebFetch', { url: 'https://example.vn/a' }).allow).toBe(true);
    expect(decideToolUse(policy, 'WebFetch', { url: 'https://example.vn/b' })).toEqual({ allow: false, reason: "WebFetch reached this run's cap of 1 calls" });
    expect(decideToolUse(policy, 'WebSearch', { query: ' ' }).allow).toBe(false);
  });

  it('reads the caps from the household settings, defaulting to 12 and 8', async () => {
    const tables = researchTables();
    const worker = replayWorker(fakeDb(tables), tables.agent_jobs ?? [], jobsDir, clockOn('2026-10-07T06:00:00+07:00'));
    const prepare = (agent: Row) => {
      tables.household_settings = [{ household_id: RESEARCH_HOUSEHOLD, agent }];
      return JOBS.research_scan.handler.prepare({ db: worker.db, job: { household_id: RESEARCH_HOUSEHOLD, id: 'job-1' } as never, jobDir: jobsDir, timezone: 'Asia/Ho_Chi_Minh', waiting: [], clock: worker.clock });
    };
    expect((await prepare({})).caps).toEqual({ WebSearch: 12, WebFetch: 8 });
    expect((await prepare({ research_searches: 4, research_fetches: 2 })).caps).toEqual({ WebSearch: 4, WebFetch: 2 });
  });
});

describe('add_research_item', () => {
  it('saves an item from a fetched page with its figure quoted from the page, linked to the property and province', async () => {
    const { call, items } = await scan();
    expect(await call('add_research_item', item())).toEqual({ text: '{"saved":true}', isError: false });
    expect(items()).toMatchObject([
      { title_vi: 'Sắp khởi công Vành đai 3 qua Phường Dĩ An', summary_vi: 'Theo bài ngày 05/10/2026, Vành đai 3 sẽ khởi công.', url_normalized: PAGE, province_codes: ['79'], job_id: 'job-scan', created_at: '2026-10-06T23:00:00.000Z' },
    ]);
    const [saved] = items();
    expect(saved?.related_property_ids).toEqual([researchTables().properties?.[2]?.id]);
  });

  it('drops a source WebFetch did not read, or read with an error, and the run goes on', async () => {
    const { prepared, call, items } = await scan({ pages: {} });
    prepared.observe?.({ name: 'WebFetch', input: { url: PAGE, prompt: 'x' }, result: { code: 404, codeText: 'Not Found', result: 'Không tìm thấy', url: PAGE } });
    expect(JSON.parse((await call('add_research_item', item())).text)).toMatchObject({ saved: false, dropped: 'not_fetched' });
    expect(items()).toEqual([]);
    expect(await prepared.finish({ reply: 'xong', model: 'm' })).toMatchObject({ empty: true, dropped: [{ source_url: PAGE, reason: 'not_fetched' }] });
  });

  it('drops a link stored before, under another spelling, and a title above 0.6 similar', async () => {
    const first = await scan();
    await first.call('add_research_item', item());
    expect(JSON.parse((await first.call('add_research_item', item({ source_url: `https://www.tintuc.example.vn/vanh-dai-3/?utm_source=zalo#top` }))).text)).toMatchObject({ dropped: 'duplicate_url' });
    const similar = await scan({ similarity: 0.7 });
    expect(JSON.parse((await similar.call('add_research_item', item())).text)).toMatchObject({ dropped: 'similar_title' });
    expect(similar.items()).toEqual([]);
  });

  it('drops old news under the keep rule, but keeps an older article about a rule effective soon', async () => {
    const { call, items } = await scan({ overrides: { lastSuccessOn: isoDate('2026-10-06') } });
    expect(JSON.parse((await call('add_research_item', item())).text)).toMatchObject({ dropped: 'seen_before' });
    expect(JSON.parse((await call('add_research_item', item({ effective_on: '2026-11-15' }))).text)).toEqual({ saved: true });
    expect(items()).toHaveLength(1);
  });

  it('refuses a quote the page does not hold, a handle no tool returned, and a summary over 60 words', async () => {
    const { call } = await scan();
    expect((await call('add_research_item', item({ quotes: ['Vành đai 4'] }))).text).toMatch(/"Vành đai 4": not on the page WebFetch returned/);
    expect((await call('add_research_item', item({ properties: ['f2'] }))).text).toMatch(/f2: not a list_properties record/);
    expect((await call('add_research_item', item({ summary_vi: `${'chữ '.repeat(61)}hết.` }))).text).toMatch(/summary_vi reads 62 words; keep it to 60/);
  });

  it('gives each item its own repair turn, and fails on a second violation of the same item with one operator note', async () => {
    const { call, tables, items } = await scan({ pages: { [PAGE]: PAGE_TEXT, 'https://example.vn/b': 'Bài Demo khác.' } });
    expect((await call('add_research_item', item({ title_vi: 'Vành đai 3 qua Dĩ An' }))).isError).toBe(true);
    expect((await call('add_research_item', item({ source_url: 'https://example.vn/b', quotes: [], title_vi: 'Tin mới hai', summary_vi: 'Tin.' }))).isError, 'the other item has its own repair').toBe(true);
    expect(await call('add_research_item', item())).toEqual({ text: '{"saved":true}', isError: false });
    await expect(call('add_research_item', item({ source_url: 'https://example.vn/b', quotes: [], title_vi: 'Vẫn hai', summary_vi: 'Tin.' }))).rejects.toThrow(NumberGuardError);
    expect(items()).toHaveLength(1);
    expect(tables.agent_items).toMatchObject([{ kind: 'system', audience: 'operator', dedupe_key: 'number_guard:job-scan' }]);
  });
});

describe('research_scan job', () => {
  it('writes the empty note once a day when it keeps nothing, and fails when the model never read the topics', async () => {
    const { prepared, tables } = await scan();
    await prepared.finish({ reply: 'xong', model: 'm' });
    await prepared.finish({ reply: 'xong', model: 'm' });
    expect(tables.agent_items).toMatchObject([{ kind: 'research_scan_empty', title: 'Không có tin đáng chú ý cho các khu vực của gia đình hôm nay.' }]);
    const tables2 = researchTables();
    await expect(scanRequest(fakeDb(tables2)).finish({ reply: 'xong', model: 'm' })).rejects.toThrow('without reading research_topics');
  });

  it('runs at 06:00 from the queue in replay, keeping the recorded items and nothing more on a second run the same day', async () => {
    const tables = researchTables();
    const job = (id: string): Row => ({ id, household_id: RESEARCH_HOUSEHOLD, kind: 'research_scan', status: 'queued', run_after: '2026-10-06T23:00:00.000Z', attempts: 0, max_attempts: 4, payload: {}, idempotency_key: `research_scan:${RESEARCH_HOUSEHOLD}:2026-10-07:${id}` });
    tables.agent_jobs = [job('job-1')];
    tables.agent_runs = [];
    const worker = replayWorker(fakeDb(tables), tables.agent_jobs, jobsDir, clockOn('2026-10-07T06:00:00+07:00'));
    withTitleCheck(worker.db, tables);
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await pollOnce(worker)).toBe(true);
    expect(tables.agent_jobs[0]).toMatchObject({ status: 'done', result: expect.objectContaining({ empty: false }) });
    expect(tables.research_items).toHaveLength(4);
    expect(tables.agent_runs?.[0]).toMatchObject({ agent_mode: 'replay', tool_calls: expect.objectContaining({ WebSearch: 5, WebFetch: 6, mcp__esta__add_research_item: 7 }) });

    tables.agent_jobs.push(job('job-2'));
    expect(await pollOnce(worker)).toBe(true);
    expect(tables.agent_jobs[1]).toMatchObject({ status: 'done' });
    expect(tables.research_items, 'every link is stored already').toHaveLength(4);
  });
});

describe('the research tools stay in their household (AGENT.md §4)', () => {
  it('lists only the job household’s live properties', async () => {
    const tables = researchTables();
    const other = { ...tables.properties?.[0], id: 'other-property', household_id: 'household-b' };
    const gone = { ...tables.properties?.[1], id: 'gone-property', deleted_at: '2026-10-01T00:00:00Z' };
    tables.properties?.push(other, gone);
    const { properties } = await listPropertiesTool(fakeDb(tables), RESEARCH_HOUSEHOLD, runSheet().cite).run();
    expect(properties).toHaveLength(7);
    expect(properties.map((row) => row.id)).not.toContain('other-property');
    expect(properties[2]).toMatchObject({ handle: 'f3', property_label: 'Dãy trọ Dĩ An', commune_name: 'Phường Dĩ An', province_name: 'TP. Hồ Chí Minh' });
  });

  it('syncs the topics from the portfolio, retiring those of a property the household no longer holds, and changes nothing on a rerun', async () => {
    const tables = researchTables();
    tables.admin_unit_legacy_map = [{ new_commune_code: '25942', old_province_name: 'Tỉnh Bình Dương', old_district_name: 'Thành phố Dĩ An', merge_kind: 'whole' }];
    const seeded = tables.research_topics?.length;
    tables.properties = (tables.properties ?? []).filter((row) => row.code !== 'BAOLOC');
    await syncResearchTopics(fakeDb(tables), RESEARCH_HOUSEHOLD);
    const topics = () => (tables.research_topics ?? []).map((row) => `${String(row.topic_key)}:${String(row.active)}`);
    expect(tables.research_topics).toHaveLength(seeded ?? 0);
    expect(topics()).toContain('province:68:false');
    expect(topics()).toContain('commune:24823:false');
    expect(topics().filter((topic) => topic.endsWith(':true'))).toHaveLength(13);
    const before = JSON.stringify(tables.research_topics);
    await syncResearchTopics(fakeDb(tables), RESEARCH_HOUSEHOLD);
    expect(JSON.stringify(tables.research_topics)).toBe(before);
  });
});
