import { visibleText } from '@esta/core/guard';
import { isoDate } from '@esta/core/date';
import { existingLinks } from '@esta/ops';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { morningBriefRequest } from '../../src/jobs/morning-brief';
import { JOBS } from '../../src/jobs/registry';
import { canonicalizer } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR } from '../../src/replay/store';
import { replaySession, type SessionRun } from '../../src/sdk/session';
import { fakeDb } from '../../src/test/fake-db';
import { mcpToolName } from '../../src/tools/server';
import { clockOn, HOUSEHOLD, labels, seedRecords, snapshot } from '../full-seed';

const jobDir = mkdtempSync(join(tmpdir(), 'esta-brief-golden-'));
afterAll(() => rmSync(jobDir, { recursive: true, force: true }));

const tables: Record<string, Array<Record<string, unknown>>> = { agent_items: [], ...seedRecords() };
const db = fakeDb(tables);
const prepared = morningBriefRequest({
  db,
  householdId: HOUSEHOLD,
  jobId: 'job-brief',
  locale: 'vi',
  asOf: isoDate('2026-10-07'),
  timezone: 'Asia/Ho_Chi_Minh',
  clock: clockOn('2026-10-07T07:00:00+07:00'),
  waiting: [],
  read: async () => ({ snapshot, labels }),
});

let run: SessionRun;
let result: { brief: { cited: unknown[]; left_out: string[] } };
beforeAll(async () => {
  run = await replaySession({ spec: JOBS.morning_brief, prompt: prepared.prompt, jobDir, configDir: jobDir, tools: prepared.tools, canon: canonicalizer({ householdName: 'Gia đình Demo', jobDir }) }, DEFAULT_REPLAY_DIR);
  result = (await prepared.finish({ reply: run.result.text, model: run.model })) as typeof result;
});

const brief = () => {
  const [item] = tables.agent_items ?? [];
  if (item === undefined) throw new Error('the brief was not written');
  return item as { kind: string; title: string; body_md: string; dedupe_key: string };
};
const links = () => [...brief().body_md.matchAll(/\]\((esta:\/\/[^)]+)\)/g)].map(([, link]) => link ?? '');

describe('morning_brief in replay on the full seed at 2026-10-07 07:00 (AGENT.md §7.3, AGT-4)', () => {
  it('saves one brief on the first create_brief call, so the number guard passed without a repair turn', () => {
    expect(run.toolCalls.map((call) => call.name)).toEqual(['watch_facts', 'recent_items', 'create_brief'].map(mcpToolName));
    expect(tables.agent_items).toHaveLength(1);
    expect(brief()).toMatchObject({ kind: 'brief', dedupe_key: 'brief:2026-10-07' });
    expect(result.brief.cited.length).toBeGreaterThan(0);
    expect(`${brief().title}${brief().body_md}`).not.toMatch(/\{\{|\}\}/);
  });

  it('holds at most 300 words as it reads', () => {
    const words = `${brief().title} ${visibleText(brief().body_md)}`.split(/\s+/u).filter(Boolean);
    expect(words.length).toBeLessThanOrEqual(300);
  });

  it('links every line to a record of the household', async () => {
    const present = await existingLinks(db, HOUSEHOLD, links());
    expect(links().length).toBe(8);
    expect(links().filter((link) => !present.has(link))).toEqual([]);
  });

  it('keeps the section order and line counts, not the wording', () => {
    const outline = brief()
      .body_md.split('\n\n')
      .map((block) => block.split('\n'))
      .reduce<Array<{ section: string; lines: string[] }>>((sections, [first = '', ...rest]) => {
        const heading = /^\*\*(.+)\*\*$/.exec(first)?.[1];
        if (heading !== undefined) return [...sections, { section: heading, lines: [] }];
        sections.at(-1)?.lines.push(...[first, ...rest].map((line) => /^- \[.*\]\(esta:\/\/([a-z]+)\//.exec(line)?.[1] ?? line));
        return sections;
      }, []);
    expect(outline).toEqual([
      { section: 'Cần làm', lines: ['invoice', 'lease', 'lease'] },
      { section: 'Theo dõi', lines: ['unit', 'unit', 'document', 'party', 'property'] },
    ]);
    expect(result.brief.left_out).toEqual([]);
  });
});
