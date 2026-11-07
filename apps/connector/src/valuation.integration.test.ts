import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { seedId } from '../../../supabase/seed/generator/ids.ts';
import { laneOperator, plannedSchema } from './test/connector';
import { demoProperty } from './test/demo-property';

// Run against a fresh `pnpm db:reset`.
const LANE = 6;
const OTHER_LANE = 8;
const Q1 = seedId(`seed:property:lane-${LANE}:q1`);
const OTHER_Q1 = seedId(`seed:property:lane-${OTHER_LANE}:q1`);

const operator = laneOperator(LANE);
const { plan, apply } = operator;

const estimate = (propertyId: unknown, set: Record<string, unknown> = {}) => ({
  op: 'valuation.record',
  input: { property_id: propertyId, as_of: '2026-10-07', value_vnd: 9_500_000_000, method: 'owner_estimate', note: 'Demo: Ryan ước theo giá khu vực', ...set },
});
const valuationRows = async (propertyId: string) => (await operator.db.from('valuations').select('id, as_of, value_vnd, method, source_url, note, created_by').eq('property_id', propertyId)).data ?? [];

describe('a market estimate saved by talking to Claude', () => {
  it('plans a preview, writes one valuation tagged with the batch, and undo deletes it', async () => {
    const before = await valuationRows(Q1);
    const planned = plannedSchema.parse((await plan('Demo: giá ước nhà Q1', [estimate(Q1, { source_url: 'https://example.com/demo/bao-gia' })])).json());
    expect(planned.items).toMatchObject([{ status: 'change' }]);
    expect(await valuationRows(Q1)).toEqual(before);

    expect(await apply(planned.planId)).toMatchObject({ status: 'applied', items: [{ status: 'landed' }] });
    const id = planned.items[0]?.id ?? '';
    const added = (await valuationRows(Q1)).filter((row) => row.id === id);
    expect(added).toMatchObject([{ as_of: '2026-10-07', value_vnd: 9_500_000_000, method: 'owner_estimate', source_url: 'https://example.com/demo/bao-gia', note: 'Demo: Ryan ước theo giá khu vực' }]);
    const audit = await operator.db.from('audit_log').select('via, batch_id, action').eq('table_name', 'valuations').eq('row_id', id);
    expect(audit.data).toEqual([{ via: 'claude', batch_id: planned.planId, action: 'insert' }]);

    expect((await operator.call('undo_batch', { batch_id: planned.planId })).json()).toEqual({ batch_id: planned.planId, archived_properties: 0 });
    expect(await valuationRows(Q1)).toEqual(before);
  });

  it('values a property created earlier in the same batch by $ref', async () => {
    const planned = plannedSchema.parse(
      (await plan('Demo: nhà mới và giá ước', [{ op: 'property.create', ref: 'house', input: { property: demoProperty('VALREF') } }, estimate({ $ref: 'house' })])).json(),
    );
    const [house, valuation] = planned.items;
    expect(planned.items).toMatchObject([{ status: 'change' }, { status: 'change', change: { propertyId: house?.id } }]);
    expect(await apply(planned.planId)).toMatchObject({ status: 'applied', items: [{ status: 'landed' }, { status: 'landed' }] });
    expect((await valuationRows(house?.id ?? '')).map((row) => row.id)).toEqual([valuation?.id]);
  });

  it("refuses a property of another household, an unknown one and a date after today, and stores no plan", async () => {
    const refused = await plan('Demo: giá ước sai', [estimate(OTHER_Q1), estimate(seedId('seed:property:nowhere'), { note: 'Demo' }), estimate(Q1, { as_of: '2026-10-08' })]);
    expect(refused.isError).toBe(true);
    const refusals = z.object({ items: z.array(z.object({ refusal: z.object({ kind: z.string(), issues: z.array(z.object({ path: z.string(), code: z.string() })) }) })) }).parse(refused.json());
    expect(refusals.items.map((item) => item.refusal)).toEqual([
      { kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] },
      { kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] },
      { kind: 'invalid', issues: [{ path: 'as_of', code: 'after_today' }] },
    ]);
    expect(await valuationRows(OTHER_Q1)).toEqual([]);
  });
});
