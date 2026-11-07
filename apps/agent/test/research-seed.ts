import { isoDate, parseInstant } from '@esta/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { householdSeeds } from '../../../supabase/seed/generator/households.ts';
import { properties as propertyRows, PROPERTY_SEEDS } from '../../../supabase/seed/generator/properties.ts';
import { researchTopics } from '../../../supabase/seed/generator/research.ts';
import { researchScanRequest } from '../src/jobs/research-scan';
import type { AgentDb } from '../src/supabase';
import { memoryDb } from '@esta/ops/test/memory-db';
import { clockOn, ROOT } from './full-seed';
import { toolCaller } from './replay-worker';

type Row = Record<string, unknown>;

const DEMO = householdSeeds(0)[0];
if (DEMO === undefined) throw new Error('no demo household seed');
const context = { household: DEMO, properties: PROPERTY_SEEDS, asOf: parseInstant('2026-10-07T06:00:00+07:00'), today: isoDate('2026-10-07') };

export const RESEARCH_HOUSEHOLD = String(propertyRows.rows(context)[0]?.household_id);

export function researchTables(): Record<string, Row[]> {
  const units = readFileSync(join(ROOT, 'supabase/seed/reference/admin_units.csv'), 'utf8')
    .split('\n')
    .slice(1)
    .map((line) => line.split(','))
    .map(([code, name]) => ({ code, name }));
  return {
    properties: propertyRows.rows(context).map((row) => ({ ...row, deleted_at: null })),
    research_topics: researchTopics.rows(context).map((row) => ({ ...row, active: true })),
    admin_units: units,
    research_items: [],
    agent_items: [],
    agent_jobs: [],
    household_settings: [{ household_id: RESEARCH_HOUSEHOLD, agent: {} }],
    households: [{ id: RESEARCH_HOUSEHOLD, name: 'Gia đình Demo', locale: 'vi' }],
  };
}

export function withTitleCheck(db: AgentDb, tables: Record<string, Row[]>): AgentDb {
  const prior: unknown = Reflect.get(db, 'rpc');
  const rpc = async (name: string, args: { p_title: string }) => {
    if (name === 'research_title_similar') return { data: (tables.research_items ?? []).some((row) => row.title_vi === args.p_title) ? 1 : 0, error: null };
    return typeof prior === 'function' ? Reflect.apply(prior, db, [name, args]) : { data: null, error: { message: `no ${name}` } };
  };
  return Object.assign(db, { rpc });
}

export function scanRequest(db: AgentDb, overrides: Partial<Parameters<typeof researchScanRequest>[0]> = {}) {
  return researchScanRequest({
    db,
    householdId: RESEARCH_HOUSEHOLD,
    jobId: 'job-scan',
    locale: 'vi',
    asOf: isoDate('2026-10-07'),
    timezone: 'Asia/Ho_Chi_Minh',
    clock: clockOn('2026-10-07T06:00:00+07:00'),
    caps: { WebSearch: 12, WebFetch: 8 },
    lastSuccessOn: null,
    ...overrides,
  });
}

/** Research items as the 06:00 scan stores them: three of relevance 0.6 or more today, one below it, and one from yesterday. */
export function storedResearch(householdId: string): Row[] {
  const item = (title_vi: string, relevance: number, created_at: string, path: string): Row => ({
    household_id: householdId,
    title_vi,
    source_name: 'Tin tức Demo',
    source_url: `https://tintuc.example.vn/${path}`,
    url_normalized: `https://tintuc.example.vn/${path}`,
    published_on: '2026-10-05',
    relevance,
    created_at,
  });
  return [
    item('TP. Đồng Nai điều chỉnh bảng giá đất, áp dụng từ 01/01/2027', 0.65, '2026-10-06T23:00:00.000Z', 'bang-gia-dat'),
    item('Sắp khởi công Vành đai 3 đoạn qua Phường Dĩ An', 0.9, '2026-10-06T23:00:00.000Z', 'vanh-dai-3'),
    item('Giá thuê đất nông nghiệp ở Tây Ninh đi ngang', 0.4, '2026-10-06T23:00:00.000Z', 'dat-nong-nghiep'),
    item('Hướng dẫn mới về khai thuế cho thuê nhà có hiệu lực từ 15/11/2026', 0.7, '2026-10-06T23:00:00.000Z', 'khai-thue'),
    item('Tin của hôm qua', 0.95, '2026-10-05T23:00:00.000Z', 'hom-qua'),
  ];
}

export const PAGE = 'https://tintuc.example.vn/vanh-dai-3';
export const PAGE_TEXT = 'Bài Demo đăng ngày 05/10/2026: Vành đai 3 đoạn qua Dĩ An sẽ khởi công tháng 12/2026, theo quy định có hiệu lực từ 15/11/2026.';

/** An `add_research_item` call for the Vành đai 3 article on PAGE, with `patch` over it. */
export const item = (patch: Row = {}): Row => ({
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

/** A scan on the research tables with `pages` already fetched and the topics and properties read, so `add_research_item` can be called. */
export async function scan(options: { pages?: Record<string, string>; similarity?: number; overrides?: Parameters<typeof scanRequest>[1] } = {}) {
  const tables = researchTables();
  const db = withTitleCheck(memoryDb(tables), tables);
  if (options.similarity !== undefined) Object.assign(db, { rpc: async () => ({ data: options.similarity, error: null }) });
  const prepared = scanRequest(db, options.overrides);
  for (const [url, result] of Object.entries(options.pages ?? { [PAGE]: PAGE_TEXT })) prepared.observe?.({ name: 'WebFetch', input: { url, prompt: 'x' }, result: { code: 200, codeText: 'OK', result, url, bytes: 1, durationMs: 1 } });
  const call = toolCaller(prepared);
  await call('research_topics');
  await call('list_properties');
  return { tables, prepared, call, items: () => tables.research_items ?? [] };
}
