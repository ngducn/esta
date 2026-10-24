import { isoDate, parseInstant } from '@esta/core';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { householdSeeds } from '../../../supabase/seed/generator/households.ts';
import { properties as propertyRows, PROPERTY_SEEDS } from '../../../supabase/seed/generator/properties.ts';
import { researchTopics } from '../../../supabase/seed/generator/research.ts';
import { researchScanRequest } from '../src/jobs/research-scan';
import type { AgentDb } from '../src/supabase';
import { clockOn, ROOT } from './full-seed';

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
