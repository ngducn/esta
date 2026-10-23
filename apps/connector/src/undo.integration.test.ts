import { describe, expect, it } from 'vitest';
import { businessChecksums } from '../../../scripts/db-checksum.ts';
import { parseSlot, slotWorkdir } from '../../../scripts/slot.ts';
import { seedId } from '../../../supabase/seed/generator/ids.ts';
import { env, laneOperator, plannedSchema, ROOT } from './test/connector';
import { nightlyRun, rental } from './test/demo-rental';
import { actAs, blockedOn, psqlSession } from './test/psql';

// Run against a fresh `pnpm db:reset`.
const LANE = 7;
const Q1 = seedId(`seed:property:lane-${LANE}:q1`);
const operator = laneOperator(LANE);
const { plan, apply } = operator;

const tablesUndoRestores = () => businessChecksums(slotWorkdir(ROOT, parseSlot(env.ESTA_SLOT))).filter((table) => table.table !== 'change_batches');

describe('a Demo rental Claude applied, undone from the connector', () => {
  it('puts every table back as it was before the apply', async () => {
    const planned = plannedSchema.parse((await plan('Demo: Phòng 7 ở Q1 cho chị Lan Demo', rental(Q1, 'Phòng 7', '0901 777 007'))).json());
    const before = tablesUndoRestores();
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied', items: Array.from({ length: 5 }, () => ({ status: 'landed' })) });
    expect(tablesUndoRestores()).not.toEqual(before);
    expect((await operator.call('undo_batch', { batch_id: planned.planId })).json()).toEqual({ batch_id: planned.planId, archived_properties: 0 });
    expect(tablesUndoRestores()).toEqual(before);
    expect((await operator.db.from('change_batches').select('status').eq('id', planned.planId).single()).data).toEqual({ status: 'undone' });
  });

  it('refuses once the nightly run issued a bill for the lease, says to void it, and changes nothing', async () => {
    const planned = plannedSchema.parse((await plan('Demo: Phòng 8 ở Q1 cho chị Lan Demo', rental(Q1, 'Phòng 8', '0901 777 008'))).json());
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied' });
    await nightlyRun(LANE, '2026-11-01');
    const before = tablesUndoRestores();
    const refused = await operator.call('undo_batch', { batch_id: planned.planId });
    expect(refused.isError).toBe(true);
    expect(refused.json()).toMatchObject({ kind: 'undo_blocked', blockers: expect.arrayContaining([expect.objectContaining({ table_name: 'invoices', reason: 'invoice_issued', flow: 'void' })]) });
    expect(tablesUndoRestores()).toEqual(before);
  });
});

describe('an undo racing a write to what the batch added', () => {
  const RYAN = seedId(`seed:user:ryan-lane-${LANE}`);
  const ME = seedId(`seed:user:me-lane-${LANE}`);

  async function undoDuring(batchId: string, write: string) {
    const [writer, undoer] = [psqlSession(), psqlSession()];
    try {
      await writer.run(write);
      const undone = undoer.run(`${actAs(RYAN)} select public.undo_change_batch('${batchId}');`);
      await blockedOn('undo_change_batch');
      await writer.run('commit;');
      const answer = (await undone).split('\n').at(-1) ?? '';
      await undoer.run('commit;');
      return JSON.parse(answer) as unknown;
    } finally {
      await Promise.all([writer.close(), undoer.close()]);
    }
  }

  it("refuses as edited when Mẹ's edit of the tenant Claude added commits while the undo waits, and keeps her edit", async () => {
    const planned = plannedSchema.parse((await plan('Demo: thêm người thuê Khoa Demo', [{ op: 'person.create', input: { person: { full_name: 'Khoa Demo', phone: '0901 777 011', id_last4: null } } }])).json());
    const tenant = planned.items[0]?.id ?? '';
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied' });
    const answer = await undoDuring(planned.planId, `${actAs(ME)} update public.parties set phone = '+84987000111' where id = '${tenant}';`);
    expect(answer).toMatchObject({ undone: false, blockers: [{ table_name: 'parties', row_id: tenant, reason: 'edited_after', flow: 'edit' }] });
    expect((await operator.db.from('parties').select('phone').eq('id', tenant).single()).data).toEqual({ phone: '+84987000111' });
  });

  it('refuses as billed when the nightly run issues a bill for the lease Claude added while the undo waits, and keeps the bill', async () => {
    const planned = plannedSchema.parse((await plan('Demo: Phòng 11 ở Q1 cho chị Lan Demo', rental(Q1, 'Phòng 11', '0901 777 012'))).json());
    const lease = planned.items[2]?.id ?? '';
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied' });
    const nightly = `begin; select set_config('request.headers', '{"x-esta-actor": "system:cron"}', true); set local role service_role;
      select public.run_invoicing('${seedId(`seed:household:lane-${LANE}`)}', '2026-11-01', '2026-11-01T00:30:00+07:00');`;
    expect(await undoDuring(planned.planId, nightly)).toMatchObject({
      undone: false,
      blockers: expect.arrayContaining([expect.objectContaining({ table_name: 'invoices', reason: 'invoice_issued', flow: 'void' })]),
    });
    const bills = await operator.db.from('invoices').select('period_start, status').eq('lease_id', lease).order('period_start');
    expect(bills.data?.slice(0, 2)).toEqual([
      { period_start: '2026-10-01', status: 'issued' },
      { period_start: '2026-11-01', status: 'issued' },
    ]);
  });
});
