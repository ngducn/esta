import { unitSchema, type UnitValue } from '@esta/core/schemas/units';
import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged } from './op';
import { viewRows } from './view';

const unitInputSchema = z.strictObject({ id: idSchema, property_id: idSchema, unit: unitSchema });

/** The row without its place in the list: the next sort order is read when it lands, so a takeover approves the same change. */
type NewUnit = { readonly id: string; readonly property_id: string; readonly row: UnitValue };
export type UnitSaved = { readonly id: string; readonly label: string };
export type UnitRefusal = { readonly kind: 'label_taken'; readonly label: string; readonly takenBy: string } | { readonly kind: 'whole_unit_leased' };

/** From the leases migration: a room would replace the property's whole unit, which has a lease. */
const SENTINELS: Readonly<Record<string, UnitRefusal>> = { ESTA_WHOLE_UNIT_LEASED: { kind: 'whole_unit_leased' } };

/** Adds a room, floor, shop or lot to a property, last in its list, under the id the caller minted. */
export const unitCreate = defineOp<z.output<typeof unitInputSchema>, NewUnit, UnitSaved, UnitRefusal>({
  creates: 'units',
  input: unitInputSchema,
  async plan(ctx, { id, property_id, unit }) {
    const [existing] = await viewRows(ctx, 'units', { id });
    if (existing !== undefined) return unchanged({ id, label: existing.label });
    const [property] = await viewRows(ctx, 'properties', { id: property_id });
    if (property === undefined) return refuse({ kind: 'invalid', issues: [{ path: 'property_id', code: 'not_found' }] });
    const holder = (await viewRows(ctx, 'units', { property_id, label: unit.label })).find((row) => row.id !== id);
    if (holder !== undefined) return refuse({ kind: 'label_taken', label: unit.label, takenBy: holder.id });
    return change({ id, property_id, row: unit });
  },
  async apply(ctx, { id, property_id, row }) {
    const last = await ctx.db
      .from('units')
      .select('sort_order')
      .eq('household_id', ctx.householdId)
      .eq('property_id', property_id)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (last.error) throw new Error(`Reading the last unit failed: ${last.error.message}`);
    const { data, error } = await ctx.db
      .from('units')
      .insert({ ...row, id, property_id, household_id: ctx.householdId, sort_order: (last.data?.sort_order ?? -1) + 1 })
      .select('id, label')
      .single();
    return error ? refuse(dbRefusal(error, SENTINELS)) : { ok: true, value: data };
  },
  writes: ({ id, property_id, row }) => [{ kind: 'create', table: 'units', row: { id, property_id, label: row.label } }],
});
