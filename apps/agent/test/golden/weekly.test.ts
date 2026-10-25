import { isoDate } from '@esta/core/date';
import { formatVnd } from '@esta/core/format';
import { visibleText } from '@esta/core/guard';
import { vnd } from '@esta/core/money';
import { existingLinks } from '@esta/ops';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { JOBS } from '../../src/jobs/registry';
import { weeklyReviewRequest } from '../../src/jobs/weekly-review';
import { canonicalizer } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR } from '../../src/replay/store';
import { replaySession, type SessionRun } from '../../src/sdk/session';
import { fakeDb } from '../../src/test/fake-db';
import { askTables } from '../ask-seed';
import { clockOn, HOUSEHOLD, seedRecords } from '../full-seed';
import { replayedReads, type RecordedReads } from './ask-reads';
import { WEEKLY_AS_OF, WEEKLY_READS_FIXTURE } from './weekly-fixture';

type Row = Record<string, unknown>;

const jobDir = mkdtempSync(join(tmpdir(), 'esta-weekly-golden-'));
afterAll(() => rmSync(jobDir, { recursive: true, force: true }));

const RING_ROAD = 'https://tintuc.example.vn/ha-tang/vanh-dai-3-doan-qua-di-an-sap-khoi-cong';

const tables = askTables('');
tables.research_items = [
  { household_id: HOUSEHOLD, url_normalized: RING_ROAD, source_url: RING_ROAD, title_vi: 'Sắp khởi công Vành đai 3 đoạn qua Phường Dĩ An', source_name: 'Tin tức Demo', published_on: '2026-10-05', relevance: 0.9, created_at: '2026-10-06T23:00:00.000Z' },
];
const prepared = weeklyReviewRequest({
  db: fakeDb(tables, [], {}, {}, { proposal_refusal: () => null }),
  householdId: HOUSEHOLD,
  jobId: 'job-weekly',
  locale: 'vi',
  asOf: isoDate(WEEKLY_AS_OF.slice(0, 10)),
  timezone: 'Asia/Ho_Chi_Minh',
  reads: replayedReads(JSON.parse(readFileSync(WEEKLY_READS_FIXTURE, 'utf8')) as RecordedReads),
  clock: clockOn(WEEKLY_AS_OF),
});

const items = (kind: string) => (tables.agent_items ?? []).filter((row) => row.kind === kind) as Array<Row & { title: string; body_md: string; dedupe_key: string; citations: Row[]; proposal: { type: string } }>;
const money = (amount: number) => formatVnd(vnd(amount), 'vi');
const LINK = /\]\((esta:\/\/[^)]+)\)/g;

let run: SessionRun;
let result: { iso_week: string; proposals: string[] };
beforeAll(async () => {
  run = await replaySession({ spec: JOBS.weekly_review, prompt: prepared.prompt, jobDir, configDir: jobDir, tools: prepared.tools, canon: canonicalizer({ householdName: 'Gia đình Demo', jobDir }), caps: prepared.caps ?? {} }, DEFAULT_REPLAY_DIR);
  result = (await prepared.finish({ reply: run.result.text, model: run.model })) as typeof result;
});

describe('weekly_review golden on the full seed at 2026-10-11 08:00 (AGT-8)', () => {
  it('replays the deep model with the read tools only, no web call refused', () => {
    expect(run.result.permissionDenials).toEqual([]);
    expect(run.toolCalls.filter(({ name }) => name.startsWith('Web'))).toEqual([]);
    expect(result.iso_week).toBe('2026-W41');
  });

  it("saves one weekly note under the ISO week's key with the collections board's month figures and its five sections in order", () => {
    const [note, ...more] = items('weekly');
    expect(more).toEqual([]);
    expect(note).toMatchObject({ dedupe_key: 'weekly_review:2026-W41', severity: 'info', audience: 'all', title: `Tổng kết tuần: tháng 10/2026 đã thu ${money(54_000_000)} trên ${money(69_600_000)}` });
    expect([...(note?.body_md ?? '').matchAll(/^\*\*(.+)\*\*$/gm)].map(([, heading]) => heading)).toEqual(['Thu tiền tháng này', 'Tháng tới', 'Phòng trống', 'Chi phí đáng chú ý', 'Thuế năm nay']);
    expect(visibleText(note?.body_md ?? '', { tables: true })).toContain(`Phòng 5 Dãy trọ Dĩ An quá hạn 16 ngày, còn nợ ${money(2_800_000)}.`);
  });

  it('links only records the household has', async () => {
    const links = items('weekly').flatMap((note) => [...note.body_md.matchAll(LINK)].map(([, link]) => link ?? ''));
    expect(links.length).toBeGreaterThan(0);
    const present = await existingLinks(fakeDb(seedRecords()), HOUSEHOLD, links);
    expect(links.filter((link) => !present.has(link))).toEqual([]);
  });

  it('makes three proposals, and its rent change cites the stored research item it rests on', () => {
    expect(items('proposal').map((row) => row.proposal.type)).toEqual(['draft_reminder', 'suggest_lease_renewal', 'suggest_rent_change']);
    expect(result.proposals).toHaveLength(3);
    const rent = items('proposal').find((row) => row.proposal.type === 'suggest_rent_change');
    expect(rent?.citations).toEqual([{ url: RING_ROAD, title: 'Sắp khởi công Vành đai 3 đoạn qua Phường Dĩ An', source_name: 'Tin tức Demo', published_at: '2026-10-05' }]);
  });
});
