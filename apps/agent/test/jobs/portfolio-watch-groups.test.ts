import { isoDate } from '@esta/core/date';
import { evaluateWatch, type WatchLabels, type WatchSnapshot } from '@esta/core/watch';
import { describe, expect, it } from 'vitest';
import { portfolioWatchPrompt } from '../../src/prompts/portfolio-watch';
import { JOBS } from '../../src/jobs/registry';
import { mcpToolName } from '../../src/tools/server';
import { labels, snapshot } from '../full-seed';
import { items, recordingDir, replay, setup, type Read, type Row } from './watch-job';

const setupOn = (read: Read, asOf: string, tables?: Record<string, Row[]>, jobId?: string) => setup(tables, jobId, 'vi', read, asOf);
const FACTS = { name: mcpToolName('watch_facts'), input: {} };

/**
 * The seed on the day meter readings come due (2026-11-06), with every action rule firing for several records: seven
 * overdue bills, two rooms empty past 90 days, two leases ending within 30 days, two papers expiring within 7, a
 * deposit unsettled, both owners past their tax threshold and twelve meters unread.
 */
function worstCase(): { read: Read; asOf: string } {
  const asOf = '2026-11-06';
  const ending = snapshot.leases.filter((lease) => lease.status === 'active' && !lease.renewed).slice(0, 2).map((lease) => lease.id);
  const moved: WatchSnapshot = {
    ...snapshot,
    asOf: isoDate(asOf),
    leases: snapshot.leases.map((lease) => (ending.includes(lease.id) ? { ...lease, end_date: isoDate('2026-11-20') } : lease)),
    documents: [...snapshot.documents, ...['a', 'b'].map((id) => ({ id: `doc-${id}`, propertyId: snapshot.properties[0]?.id ?? null, expiresOn: isoDate('2026-11-08') }))],
    taxPositions: snapshot.taxPositions.map((position) => ({ ...position, progressBp: 10_500 })),
  };
  const worstLabels: WatchLabels = { ...labels, documents: new Map([...labels.documents, ['doc-a', 'Sổ Demo A'], ['doc-b', 'Sổ Demo B']]) };
  return { read: async () => ({ snapshot: moved, labels: worstLabels }), asOf };
}

type WatchAnswer = { facts: Array<Record<string, unknown> & { handle: string; severity: string }>; groups: Array<{ rule_id: string; facts: string[] }> };

/** The notes the prompt asks for, written the way the model would: one for each group, then the grouped note. */
function notesFor({ facts, groups }: WatchAnswer) {
  const nameOf = (handle: string) => {
    const record = facts.find((fact) => fact.handle === handle);
    return ['place_label', 'document_label', 'owner_name', 'tenant_name'].find((field) => typeof record?.[field] === 'string' && record[field] !== '') ?? 'place_label';
  };
  const list = (handles: string[]) => handles.map((handle) => `- {{${handle}.${nameOf(handle)}}}`).join('\n');
  const told = groups.map(({ facts: handles }) => ({ title: `{{${handles[0]}.group_count_display}} việc cần xem`, body_md: list(handles), related: handles }));
  const rest = facts.filter(({ severity }) => severity !== 'action').map(({ handle }) => handle);
  return rest.length === 0 ? told : [...told, { title: 'Các việc cần để ý hôm nay', body_md: list(rest), related: rest }];
}


describe('portfolio_watch on a day with many items (#404)', () => {
  const { read, asOf } = worstCase();

  async function facts(call: ReturnType<typeof setupOn>['call']) {
    return JSON.parse((await call('watch_facts')).text) as WatchAnswer;
  }

  it('has every action rule firing with several facts on the worst-case day', async () => {
    const { snapshot: moved } = await read();
    const action = evaluateWatch(moved).filter((fact) => fact.severity === 'action');
    const counts = new Map<string, number>();
    for (const { ruleId } of action) counts.set(ruleId, (counts.get(ruleId) ?? 0) + 1);
    const byRule = [...counts];
    expect(byRule).toEqual([['W1', 7], ['W3', 2], ['W4', 2], ['W5', 2], ['W6', 1], ['W7', 2], ['W8', 12]]);
  });

  it('tells all the action facts of a rule in one note, so the whole day is a few notes a run can write in one turn', async () => {
    const { call, tables, prepared } = setupOn(read, asOf);
    const answer = await facts(call);
    const notes = notesFor(answer);
    expect(answer.facts.filter(({ severity }) => severity === 'action')).toHaveLength(28);
    expect(notes.length).toBeLessThan(28);
    const answers = await Promise.all(notes.map((told) => call('create_item', told)));
    expect(answers.map((answer) => answer.text)).toEqual(notes.map(() => expect.stringContaining('saved')));
    const meters = items(tables).find((item) => String(item.dedupe_key) === `watch:W8:group:${asOf}`);
    expect(meters).toMatchObject({ severity: 'action', title: '12 việc cần xem' });
    expect((meters?.related as { facts: unknown[] }).facts).toHaveLength(12);
    expect(String(meters?.body_md).split('\n')).toHaveLength(12);
    const result = (await prepared.finish({ reply: 'xong', model: 'm' })) as { left_out: string[] };
    expect(result.left_out).toEqual([]);
    expect(items(tables)).toHaveLength(notes.length);
  });

  it('fits the turn limit with one turn for the facts, one for every note, one for the reply and two spare', async () => {
    const { prepared, call } = setupOn(read, asOf);
    const notes = notesFor(await facts(call));
    const dir = recordingDir(prepared, [FACTS, ...notes.map((told) => ({ name: mcpToolName('create_item'), input: told }))]);
    const run = await replay(prepared, dir);
    expect(run.toolCalls).toHaveLength(notes.length + 1);
    await expect(prepared.finish({ reply: 'xong', model: 'm' })).resolves.toMatchObject({ facts: 31 });
    const turns = 3;
    expect(turns + 2).toBeLessThanOrEqual(JOBS.portfolio_watch.maxTurns);
  });

  it('refuses a note that tells only some of a rule\'s action facts, and names the handles to relate', async () => {
    const { call, tables } = setupOn(read, asOf);
    const answer = await facts(call);
    const meters = answer.groups.find(({ rule_id }) => rule_id === 'W8')?.facts ?? [];
    const refused = await call('create_item', { title: '{{' + meters[0] + '.group_count_display}} đồng hồ', body_md: '{{' + meters[0] + '.place_label}}', related: meters.slice(0, 5) });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain(`Relate exactly ${meters.join(', ')}`);
    const across = await call('create_item', { title: 'Việc', body_md: 'Xem.', related: [meters[0] ?? '', answer.groups[0]?.facts[0] ?? ''] });
    expect(across.isError).toBe(true);
    expect(items(tables)).toEqual([]);
  });

  it('refuses an action fact told with a watch fact', async () => {
    const { call } = setupOn(read, asOf);
    const answer = await facts(call);
    const watch = answer.facts.find(({ severity }) => severity === 'watch')?.handle ?? '';
    const refused = await call('create_item', { title: 'Việc', body_md: 'Xem.', related: [answer.groups[0]?.facts[0] ?? '', watch] });
    expect(refused.text).toMatch(/action facts only/);
  });

  it('adds no second note when it runs again the same day, even when the model splits the group another way', async () => {
    const tables: Record<string, Row[]> = { agent_items: [] };
    const first = setupOn(read, asOf, tables, 'job-1');
    for (const told of notesFor(await facts(first.call))) await first.call('create_item', told);
    const count = items(tables).length;
    const again = setupOn(read, asOf, tables, 'job-2');
    for (const told of notesFor(await facts(again.call)).toReversed()) await again.call('create_item', told);
    const result = (await again.prepared.finish({ reply: 'xong', model: 'm' })) as { notes: Array<{ added: boolean }> };
    expect(items(tables)).toHaveLength(count);
    expect(result.notes.some(({ added }) => added)).toBe(false);
  });

  it('tells a meter that joins a group after the day\'s note exists the next day, not twice today', async () => {
    const { snapshot: moved, labels: movedLabels } = await read();
    const [meter] = moved.meters.filter((entry) => entry.lastReadOn === null || entry.lastReadOn < '2026-11-01');
    const without: Read = async () => ({ snapshot: { ...moved, meters: moved.meters.map((entry) => (entry.id === meter?.id ? { ...entry, lastReadOn: isoDate('2026-11-02') } : entry)) }, labels: movedLabels });
    const tables: Record<string, Row[]> = { agent_items: [] };
    const early = setupOn(without, asOf, tables, 'job-1');
    for (const told of notesFor(await facts(early.call))) await early.call('create_item', told);
    const stored = items(tables).find((item) => String(item.dedupe_key) === `watch:W8:group:${asOf}`);
    const room = (list: Row | undefined) => (list?.related as { facts: unknown[] }).facts.length;

    const later = setupOn(read, asOf, tables, 'job-2');
    for (const told of notesFor(await facts(later.call))) await later.call('create_item', told);
    expect(items(tables).filter((item) => String(item.dedupe_key).startsWith('watch:W8:'))).toHaveLength(1);
    expect(room(stored)).toBe(11);

    const tomorrow = setupOn(read, '2026-11-07', tables, 'job-3');
    for (const told of notesFor(await facts(tomorrow.call))) await tomorrow.call('create_item', told);
    const next = items(tables).find((item) => String(item.dedupe_key) === 'watch:W8:group:2026-11-07');
    expect(room(next)).toBe(12);
  });

  it('refuses a note that cites a fact outside its related facts, such as another group\'s count', async () => {
    const { call, tables } = setupOn(read, asOf);
    const answer = await facts(call);
    const overdue = answer.groups.find(({ rule_id }) => rule_id === 'W1')?.facts ?? [];
    const meters = answer.groups.find(({ rule_id }) => rule_id === 'W8')?.facts ?? [];
    const refused = await call('create_item', { title: `{{${meters[0]}.group_count_display}} hóa đơn quá hạn`, body_md: `- {{${overdue[0]}.place_label}}`, related: overdue });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain(`${meters[0]}: cited but not in related`);
    expect(items(tables)).toEqual([]);
  });

  it('asks every note to say what happened and what to do, with each fact\'s own figures', () => {
    const prompt = portfolioWatchPrompt({ locale: 'vi', today: isoDate(asOf), timezone: 'Asia/Ho_Chi_Minh' });
    expect(prompt).toMatch(/says what happened and what to do/);
    expect(prompt).toMatch(/amount owed, the due date and the days overdue/);
    expect(prompt).toMatch(/that fact's own figures/);
  });

  it('holds a grouped note\'s numbers to the number guard like any note\'s', async () => {
    const { call } = setupOn(read, asOf);
    const answer = await facts(call);
    const meters = answer.groups.find(({ rule_id }) => rule_id === 'W8')?.facts ?? [];
    const slipped = await call('create_item', { title: '12 đồng hồ đến hạn ghi chỉ số', body_md: meters.map((handle) => `- {{${handle}.place_label}}`).join('\n'), related: meters });
    expect(slipped.isError).toBe(true);
    expect(slipped.text).toContain('"12": Do not type a number.');
  });
});

