import { isoDate } from '@esta/core/date';
import type { Locale } from '@esta/core/format';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { JOBS } from '../../src/jobs/registry';
import { portfolioWatchRequest } from '../../src/jobs/portfolio-watch';
import { canonicalizer, inputHash } from '../../src/replay/canonicalize';
import { DEFAULT_REPLAY_DIR, recordingSchema, writeRecording } from '../../src/replay/store';
import { canonicalInput, replaySession } from '../../src/sdk/session';
import { fakeDb, type Recorded } from '../../src/test/fake-db';
import { NumberGuardError } from '../../src/tools/create-item';
import { mcpToolName } from '../../src/tools/server';
import { CASES, clockOn, HOUSEHOLD, labels, snapshot } from '../full-seed';
import { toolCaller } from '../replay-worker';

const clock = clockOn('2026-10-07T06:45:00+07:00');

type Row = Record<string, unknown>;

function setup(tables: Record<string, Row[]> = { agent_items: [] }, jobId = 'job-1', locale: Locale = 'vi') {
  const writes: Recorded[] = [];
  const db = fakeDb(tables, writes);
  const prepared = portfolioWatchRequest({ db, householdId: HOUSEHOLD, jobId, locale, asOf: isoDate('2026-10-07'), timezone: 'Asia/Ho_Chi_Minh', clock, read: async () => ({ snapshot, labels }) });
  return { tables, writes, prepared, call: toolCaller(prepared) };
}

const items = (tables: Record<string, Row[]>) => tables.agent_items ?? [];
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

async function replay(prepared: ReturnType<typeof setup>['prepared'], replayDir = DEFAULT_REPLAY_DIR) {
  const jobDir = mkdtempSync(join(tmpdir(), 'esta-watch-job-'));
  dirs.push(jobDir);
  return replaySession({ spec: JOBS.portfolio_watch, prompt: prepared.prompt, jobDir, configDir: jobDir, tools: prepared.tools, canon: canonicalizer({ householdName: 'Gia đình Demo', jobDir }) }, replayDir);
}

/** A recording of `toolCalls` for this prompt in a fresh directory, for the cases no committed recording covers. */
function recordingDir(prepared: ReturnType<typeof setup>['prepared'], toolCalls: Array<{ name: string; input: Record<string, unknown> }>) {
  const dir = mkdtempSync(join(tmpdir(), 'esta-watch-replay-'));
  dirs.push(dir);
  const input = canonicalInput({ spec: JOBS.portfolio_watch, prompt: prepared.prompt, canon: canonicalizer({ householdName: 'Gia đình Demo' }) });
  writeRecording(dir, { version: 1, kind: 'portfolio_watch', inputHash: inputHash(input), input, model: 'test', numTurns: toolCalls.length + 1, toolCalls, reply: 'xong' });
  return dir;
}

const note = (title: string, body_md: string, related: string[]) => ({ name: mcpToolName('create_item'), input: { title, body_md, related } });
const FACTS = { name: mcpToolName('watch_facts'), input: {} };

describe('portfolio_watch in replay on the full seed at 2026-10-07 (AGENT.md §7.1)', () => {
  it('writes one note per action fact and one grouped note, every number filled from the tools', async () => {
    const { tables, prepared } = setup();
    const run = await replay(prepared);
    const result = (await prepared.finish({ reply: run.result.text, model: run.model })) as { facts: number; notes: unknown[] };
    expect(run.toolCalls.map((call) => call.name)).toEqual([mcpToolName('watch_facts'), ...Array.from({ length: 4 }, () => mcpToolName('create_item'))]);
    expect(result.facts).toBe(8);
    const written = items(tables);
    expect(written.map((item) => item.severity)).toEqual(['action', 'action', 'action', 'watch']);
    const [w1, w3, w6, digest] = written;
    expect(w1).toMatchObject({ kind: 'alert', audience: 'all', title: 'Phòng 5 Dãy trọ Dĩ An quá hạn 12 ngày', dedupe_key: expect.stringMatching(/^watch:W1:invoice:[0-9a-f-]{36}:2026-10-07$/) });
    expect(w1?.body_md).toBe('Hóa đơn của Hoàng Văn Em Demo đến hạn ngày 25/09/2026 đã quá hạn 12 ngày, còn nợ 2.800.000 ₫. Nên nhắc khách đóng tiền.');
    expect(w3?.title).toBe('Hợp đồng Căn hộ Thủ Đức sắp hết hạn');
    expect(w6?.body_md).toContain('tiền cọc 2.800.000 ₫');
    expect(digest).toMatchObject({ severity: 'watch', dedupe_key: 'watch_digest:2026-10-07' });
    expect(digest?.body_md).toContain('Kho Biên Hòa để trống 70 ngày');
    expect(digest?.body_md).toContain('Phòng 8 Dãy trọ Dĩ An để trống 67 ngày');
    expect((digest?.related as { facts: unknown[]; links: string[] }).links).toHaveLength(5);
    expect((digest?.related as { links: string[] }).links.every((link) => /^esta:\/\/(unit|document|party|property)\/[0-9a-f-]{36}$/.test(link))).toBe(true);
  });

  it('adds nothing when it runs again the same day', async () => {
    const first = setup();
    await replay(first.prepared);
    const again = setup(first.tables, 'job-2');
    await replay(again.prepared);
    const result = (await again.prepared.finish({ reply: 'xong', model: 'test' })) as { notes: Array<{ added: boolean }> };
    expect(items(first.tables)).toHaveLength(4);
    expect(result.notes.map((written) => written.added)).toEqual([false, false, false, false]);
  });

  it('fails with number_guard when the note still types numbers after its repair turn, leaving one operator note', async () => {
    const { tables, prepared } = setup();
    const failure = await replay(prepared, join(CASES, 'guard-violation')).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(NumberGuardError);
    expect((failure as Error).message).toMatch(/^number_guard/);
    expect(items(tables)).toHaveLength(1);
    const [operator] = items(tables);
    expect(operator).toMatchObject({ kind: 'system', severity: 'info', audience: 'operator', dedupe_key: 'number_guard:job-1' });
    expect(operator?.body_md).toContain('"mười": word');
    expect(operator?.body_md).toContain('quá hạn mười hai ngày');
  });

  it('saves a note that passes after one repair turn', async () => {
    const { tables, prepared } = setup();
    const fixed = note('{{f1.place_label}} quá hạn {{f1.days_overdue_display}}', 'Còn nợ {{f1.outstanding_display}}.', ['f1']);
    const dir = recordingDir(prepared, [FACTS, note('Phòng năm quá hạn', 'Còn nợ.', ['f1']), fixed]);
    await replay(prepared, dir);
    expect(items(tables).map((item) => item.title)).toEqual(['Phòng 5 Dãy trọ Dĩ An quá hạn 12 ngày']);
    await expect(prepared.finish({ reply: 'xong', model: 'test' })).rejects.toThrow(/f2 \(W3\), f6 \(W6\)/);
  });
});

describe('portfolio_watch before the live run (#318)', () => {
  it('leaves room under the turn limit for the repair turn the guard allows and one refused note', () => {
    const dir = join(DEFAULT_REPLAY_DIR, 'portfolio_watch');
    const recordings = readdirSync(dir).map((file) => recordingSchema.parse(JSON.parse(readFileSync(join(dir, file), 'utf8'))));
    expect(recordings.length).toBeGreaterThan(0);
    for (const recording of recordings) expect(recording.numTurns + 2, recording.label).toBeLessThanOrEqual(JOBS.portfolio_watch.maxTurns);
  });

  it('replays an English household from its own recording and writes its notes in English', async () => {
    const { tables, prepared } = setup({ agent_items: [] }, 'job-1', 'en');
    const run = await replay(prepared);
    await prepared.finish({ reply: run.result.text, model: run.model });
    const written = items(tables);
    expect(written.map((item) => item.severity)).toEqual(['action', 'action', 'action', 'watch']);
    expect(written[0]?.title).toMatch(/overdue/);
    expect(written.map((item) => `${String(item.title)} ${String(item.body_md)}`).join(' ')).not.toMatch(/quá hạn|hợp đồng|để trống|tiền cọc/i);
  });

  it('tells each action fact in one note, so a rerun that groups them another way adds no copy', async () => {
    const tables: Record<string, Row[]> = { agent_items: [] };
    for (const [jobId, groups] of [['job-1', [['f1', 'f2'], ['f6']]], ['job-2', [['f2', 'f1'], ['f6']]]] as const) {
      const { call } = setup(tables, jobId);
      await call('watch_facts');
      for (const group of groups) {
        const told = { title: 'Việc cần làm', body_md: group.map((handle) => `{{${handle}.place_label}}`).join(', '), related: [...group] };
        if ((await call('create_item', told)).isError) for (const handle of group) await call('create_item', { ...told, body_md: `{{${handle}.place_label}}`, related: [handle] });
      }
    }
    const tellings = items(tables).flatMap((item) => (item.related as { facts: Array<{ subject_key: string }> }).facts.map((fact) => fact.subject_key));
    expect(tellings).toHaveLength(3);
    expect(new Set(tellings).size).toBe(3);
  });
});

describe('create_item for portfolio_watch', () => {
  it('rejects a fact the run did not read, and a fact already in a note', async () => {
    const { call } = setup();
    await call('watch_facts');
    expect(await call('create_item', { title: 'Việc mới', body_md: 'Không có.', related: ['f9'] })).toEqual({ text: expect.stringMatching(/^f9: not a fact watch_facts returned/), isError: true });
    expect((await call('create_item', { title: '{{f1.place_label}}', body_md: 'Còn nợ {{f1.outstanding_display}}.', related: ['f1'] })).isError).toBe(false);
    expect((await call('create_item', { title: '{{f1.place_label}}', body_md: 'Lại.', related: ['f1'] })).text).toMatch(/^f1: already in a note/);
  });

  it('tells the model what to fix on the first violation, naming the text and the rule', async () => {
    const { call, tables } = setup();
    await call('watch_facts');
    const answer = await call('create_item', { title: 'Phòng 5 quá hạn', body_md: 'Còn nợ ba triệu.', related: ['f1'] });
    expect(answer.isError).toBe(true);
    expect(answer.text).toContain('"5": Do not type a number.');
    expect(answer.text).toContain('"ba": Do not write an amount');
    expect(items(tables)).toEqual([]);
  });

  it('checks the title as literal text, so an entity there is a typed number', async () => {
    const { call } = setup();
    await call('watch_facts');
    expect((await call('create_item', { title: 'Phòng &#53;', body_md: 'Còn nợ.', related: ['f1'] })).text).toContain('Do not type a number');
  });

  it('keeps one grouped note per run', async () => {
    const { call } = setup();
    await call('watch_facts');
    expect((await call('create_item', { title: 'Để ý', body_md: '{{f3.place_label}} để trống.', related: ['f3'] })).isError).toBe(false);
    expect((await call('create_item', { title: 'Để ý thêm', body_md: '{{f4.place_label}} để trống.', related: ['f4'] })).text).toMatch(/already wrote the grouped note/);
  });

  it('fails the job when the model never reads the facts', async () => {
    await expect(setup().prepared.finish({ reply: 'xong', model: 'test' })).rejects.toThrow(/without reading watch_facts/);
  });
});

describe('one recording for every household seeded alike (AGENT.md §8)', () => {
  it('hashes two lane households to the committed recording, and their notes cite each household\'s own records', async () => {
    const hashFor = (householdName: string) => {
      const { prepared } = setup();
      return inputHash(canonicalInput({ spec: JOBS.portfolio_watch, prompt: prepared.prompt, canon: canonicalizer({ householdName }) }));
    };
    expect(hashFor('Gia đình Demo 4')).toBe(hashFor('Gia đình Demo 7'));
    expect(readFileSync(join(DEFAULT_REPLAY_DIR, 'portfolio_watch', `${hashFor('Gia đình Demo 4')}.json`), 'utf8')).toContain('Hand-written');
    const { tables, prepared } = setup();
    await replay(prepared);
    const ids = new Set([...snapshot.units.map((unit) => unit.id), ...snapshot.invoices.map((invoice) => invoice.id), ...snapshot.leases.map((lease) => lease.id)]);
    const links = items(tables).flatMap((item) => (item.related as { links: string[] }).links);
    expect(links.filter((link) => /esta:\/\/(unit|invoice|lease)\//.test(link)).every((link) => ids.has(link.split('/').at(-1) ?? ''))).toBe(true);
  });
});
