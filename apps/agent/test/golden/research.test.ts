import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JOBS } from '../../src/jobs/registry';
import { canonicalizer } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR } from '../../src/replay/store';
import { replaySession, type SessionRun } from '../../src/sdk/session';
import { fakeDb } from '../../src/test/fake-db';
import { CASES } from '../full-seed';
import { researchTables, scanRequest, withTitleCheck } from '../research-seed';

const jobDir = mkdtempSync(join(tmpdir(), 'esta-research-golden-'));
afterAll(() => rmSync(jobDir, { recursive: true, force: true }));

async function replay(dir: string) {
  const tables = researchTables();
  const prepared = scanRequest(withTitleCheck(fakeDb(tables), tables));
  const { caps, observe } = prepared;
  const run = await replaySession(
    { spec: JOBS.research_scan, prompt: prepared.prompt, jobDir, configDir: jobDir, tools: prepared.tools, canon: canonicalizer({ householdName: 'Gia đình Demo', jobDir }), ...(caps === undefined ? {} : { caps }), ...(observe === undefined ? {} : { observe }) },
    dir,
  );
  const result = (await prepared.finish({ reply: run.result.text, model: run.model })) as { kept: unknown[]; dropped: Array<{ source_url: string; reason: string }>; empty: boolean };
  return { tables, run, result };
}

type Item = { title_vi: string; summary_vi: string; why_it_matters_vi: string; url_normalized: string; related_property_ids: string[]; province_codes: string[]; relevance: number };

describe('research_scan in replay on the full seed at 2026-10-07 06:00 (AGENT.md §7, AGT-5)', () => {
  let run: SessionRun;
  let tables: Record<string, Array<Record<string, unknown>>>;
  let result: Awaited<ReturnType<typeof replay>>['result'];
  beforeAll(async () => ({ run, tables, result } = await replay(DEFAULT_REPLAY_DIR)));
  const items = () => (tables.research_items ?? []) as unknown as Item[];

  it('keeps the four new items, each filled from tool data with no placeholder left', () => {
    expect(items().map((item) => item.title_vi)).toEqual([
      'Sắp khởi công Vành đai 3 đoạn qua Phường Dĩ An',
      'TP. Đồng Nai điều chỉnh bảng giá đất, áp dụng từ 01/01/2027',
      'Hướng dẫn mới về khai thuế cho thuê nhà có hiệu lực từ 15/11/2026',
      'Giá thuê đất nông nghiệp ở Tây Ninh đi ngang',
    ]);
    expect(JSON.stringify(items())).not.toMatch(/\{\{|\}\}/);
    expect(items()[0]?.summary_vi).toContain('Theo bài đăng ngày 05/10/2026');
    expect(result.empty).toBe(false);
    expect(tables.agent_items, 'no empty note on a day with news').toEqual([]);
  });

  it('stores normalized links, summaries within 60 words, and related properties that exist (AGT-5)', () => {
    const ids = new Set((tables.properties ?? []).map((row) => row.id));
    expect(items()[1]?.url_normalized).toBe('https://baodemo.example.vn/dong-nai-dieu-chinh-bang-gia-dat');
    for (const item of items()) {
      expect(item.summary_vi.split(/\s+/u).filter(Boolean).length).toBeLessThanOrEqual(60);
      expect(item.related_property_ids.length).toBeGreaterThan(0);
      expect(item.related_property_ids.every((id) => ids.has(id))).toBe(true);
    }
    expect(items()[0]?.province_codes).toEqual(['79']);
  });

  it('drops the unreachable source, the second link to one page and the old article, and says why', () => {
    expect(result.dropped.map(({ reason }) => reason)).toEqual(['not_fetched', 'duplicate_url', 'seen_before']);
  });

  it('runs every web call under the caps and denies none', () => {
    expect(run.result.permissionDenials).toEqual([]);
    expect(run.toolCalls.filter((call) => call.name === 'WebFetch')).toHaveLength(6);
  });
});

describe('research_scan replay cases', () => {
  it('writes the one empty note when the scan keeps nothing (lane 4)', async () => {
    const { tables, result } = await replay(join(CASES, 'research-empty'));
    expect(result.empty).toBe(true);
    expect(tables.research_items).toEqual([]);
    expect(tables.agent_items).toMatchObject([{ kind: 'research_scan_empty', severity: 'info', audience: 'all', title: 'Không có tin đáng chú ý cho các khu vực của gia đình hôm nay.', dedupe_key: 'research_scan_empty:2026-10-07' }]);
  });

  it('allows 12 searches and 8 fetches and books the extra calls as denied (lane 7)', async () => {
    const { run } = await replay(join(CASES, 'research-over-cap'));
    const count = (name: string) => run.toolCalls.filter((call) => call.name === name).length;
    expect([count('WebSearch'), count('WebFetch')]).toEqual([13, 9]);
    expect((run.result.permissionDenials as Array<{ tool_name: string }>).map((denial) => denial.tool_name)).toEqual(['WebSearch', 'WebFetch']);
  });
});
