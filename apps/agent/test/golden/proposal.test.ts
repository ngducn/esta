import { describe, expect, it } from 'vitest';
import { fakeDb } from '../../src/test/fake-db';
import { NumberGuardError } from '../../src/tools/create-item';
import { proposalWriter } from '../../src/tools/create-proposal';
import { runSheet } from '../../src/tools/fact-sheet';
import { ToolRejection } from '../../src/tools/server';
import { watchFactsTool } from '../../src/tools/watch-facts';
import { clockOn, HOUSEHOLD, labels, seedRecords, snapshot } from '../full-seed';

const [PROPERTY = ''] = labels.properties.keys();
const OTHER_HOUSEHOLD_PROPERTY = '00000000-0000-4000-8000-0000000000b1';

/** A run that read watch_facts, as the weekly review and ask will before they propose (AGENT.md §4). */
async function setup() {
  const tables: Record<string, Array<Record<string, unknown>>> = { agent_items: [], ...seedRecords() };
  const { sheet, cite } = runSheet();
  await watchFactsTool(async () => ({ snapshot, labels }), 'vi', cite).run();
  const writer = proposalWriter({ db: fakeDb(tables), householdId: HOUSEHOLD, jobId: 'job-propose', locale: 'vi', sheet, clock: clockOn('2026-10-07T08:00:00+07:00') });
  return { tables, writer };
}

const task = (params: Record<string, unknown>, rationale = 'Khách chưa đóng tiền tháng này.') => ({ type: 'create_task', params, rationale });

describe('create_proposal validation (AGENT.md §7)', () => {
  it('stores a create_task proposal with its text filled from the facts and its params as the registry reads them', async () => {
    const { tables, writer } = await setup();
    const saved = await writer.write(task({ title: 'Gọi người thuê {{f1.place_label}}', due_on: '2026-10-07', property_id: PROPERTY }, '{{f1.tenant_name}} còn nợ {{f1.outstanding_display}}.'));
    expect(saved).toMatchObject({ saved: true, added: true, dedupe_key: expect.stringMatching(/^proposal:create_task:[0-9a-f]{32}$/) });
    expect(tables.agent_items).toEqual([
      expect.objectContaining({
        household_id: HOUSEHOLD,
        kind: 'proposal',
        audience: 'all',
        job_id: 'job-propose',
        title: 'Gọi người thuê Phòng 5 Dãy trọ Dĩ An',
        body_md: expect.stringMatching(/^Hoàng Văn Em Demo còn nợ 2\.800\.000\s₫\.$/u),
        proposal: { type: 'create_task', params: { title: 'Gọi người thuê Phòng 5 Dãy trọ Dĩ An', due_on: '2026-10-07', property_id: PROPERTY, lease_id: null } },
        related: { links: [`esta://property/${PROPERTY}`] },
      }),
    ]);
  });

  it('adds nothing when the same proposal comes again', async () => {
    const { tables, writer } = await setup();
    const proposal = task({ title: 'Gọi người thuê {{f1.place_label}}', property_id: PROPERTY });
    await writer.write(proposal);
    expect(await writer.write(proposal)).toMatchObject({ added: false });
    expect(tables.agent_items).toHaveLength(1);
  });

  it.each([
    ['an unknown type', { type: 'sell_property', params: {}, rationale: 'Bán đi.' }, 'type: "sell_property" is not a proposal type'],
    ['a missing title', task({ due_on: '2026-10-07' }), 'params.title:'],
    ['an impossible due date', task({ title: 'Gọi khách', due_on: '2026-13-01' }), 'params.due_on:'],
    ['a field the type does not take', task({ title: 'Gọi khách', amount_vnd: 'nhiều' }), 'params:'],
    ['a property of another household', task({ title: 'Gọi khách', property_id: OTHER_HOUSEHOLD_PROPERTY }), `esta://property/${OTHER_HOUSEHOLD_PROPERTY}: not a record of this household`],
    ['a filled title over the limit', task({ title: `${'Gọi khách '.repeat(20)}{{f1.place_label}}` }), 'params.title:'],
  ])('sends %s back to the model and stores nothing', async (_, input, message) => {
    const { tables, writer } = await setup();
    const call = writer.write(input);
    await expect(call).rejects.toBeInstanceOf(ToolRejection);
    await expect(call).rejects.toThrow(message);
    expect(tables.agent_items).toEqual([]);
  });

  it('gives a typed number one repair turn, then fails the job and leaves the operator note', async () => {
    const { tables, writer } = await setup();
    const typed = task({ title: 'Gọi người thuê Phòng 5' });
    await expect(writer.write(typed)).rejects.toBeInstanceOf(ToolRejection);
    await expect(writer.write(task({ title: 'Gọi khách' }, 'Khách nợ 2 tháng.'))).rejects.toBeInstanceOf(NumberGuardError);
    expect(tables.agent_items).toEqual([expect.objectContaining({ kind: 'system', audience: 'operator', dedupe_key: 'number_guard:job-propose' })]);
  });
});
