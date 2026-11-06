import type { Tables } from '@esta/db';
import { addRoomsSchema, unitSchema, type UnitValue } from '@esta/core/schemas/units';
import { z } from 'zod';
import { changedColumns, dbRefusal, idSchema, writtenRow, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged } from './op';
import { softDeleteOps } from './soft-delete';
import { viewRows } from './view';

const unitInputSchema = z.strictObject({ id: idSchema, property_id: idSchema, unit: unitSchema });

/** The row without its place in the list: the next sort order is read when it lands, so a takeover approves the same change. */
type NewUnit = { readonly id: string; readonly property_id: string; readonly row: UnitValue };
export type UnitSaved = { readonly id: string; readonly label: string };
export type UnitRefusal =
  | { readonly kind: 'label_taken'; readonly label: string; readonly takenBy: string }
  | { readonly kind: 'whole_unit_leased' }
  | { readonly kind: 'unit_has_leases' }
  | { readonly kind: 'units_changed' };

const SENTINELS: Readonly<Record<string, UnitRefusal>> = {
  ESTA_WHOLE_UNIT_LEASED: { kind: 'whole_unit_leased' },
  ESTA_UNIT_HAS_LEASES: { kind: 'unit_has_leases' },
  ESTA_UNITS_CHANGED: { kind: 'units_changed' },
};
const FUNCTION_SENTINELS: Readonly<Record<string, UnitRefusal | CommonRefusal>> = { ...SENTINELS, ESTA_PROPERTY_NOT_FOUND: { kind: 'not_found' } };

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

const UNIT_KEYS = ['label', 'kind', 'area_m2', 'list_rent_vnd', 'available_from'] as const;
type StoredUnit = Pick<Tables<'units'>, (typeof UNIT_KEYS)[number]>;

/** `Lưu` on a room: the columns that differ from the stored row, so saving what is already there writes nothing. */
export const unitUpdate = defineOp<z.output<typeof unitInputSchema>, { readonly id: string; readonly set: Partial<StoredUnit> }, UnitSaved, UnitRefusal>({
  creates: null,
  input: unitInputSchema,
  async plan(ctx, { id, property_id, unit }) {
    const { data, error } = await ctx.db
      .from('units')
      .select('label, kind, area_m2, list_rent_vnd, available_from')
      .eq('household_id', ctx.householdId)
      .eq('property_id', property_id)
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Reading the unit failed: ${error.message}`);
    if (data === null) return refuse({ kind: 'not_found' });
    const holder = (await viewRows(ctx, 'units', { property_id, label: unit.label })).find((row) => row.id !== id);
    if (holder !== undefined) return refuse({ kind: 'label_taken', label: unit.label, takenBy: holder.id });
    const changed = changedColumns<StoredUnit>(data, unit, UNIT_KEYS);
    return changed === null ? unchanged({ id, label: unit.label }) : change({ id, set: changed.set });
  },
  async apply(ctx, { id, set }) {
    const result = await ctx.db.from('units').update(set).eq('household_id', ctx.householdId).eq('id', id).is('deleted_at', null).select('id, label');
    const written = await writtenRow(id, result, async () => (await ctx.db.from('units').select('id').eq('id', id).maybeSingle()).data !== null, SENTINELS);
    return written.ok ? { ok: true, value: { id, label: result.data?.[0]?.label ?? '' } } : written;
  },
});

const addRoomsInputSchema = addRoomsSchema.extend({ property_id: idSchema });
export type RoomsAdded = { readonly added: number };

/** `Thêm phòng`: rooms numbered after the last one by the database, under the property's lock; a label already there is skipped. */
export const unitAddRooms = defineOp<z.output<typeof addRoomsInputSchema>, z.output<typeof addRoomsInputSchema>, RoomsAdded, UnitRefusal>({
  creates: 'units',
  input: addRoomsInputSchema,
  async plan(ctx, input) {
    const { data, error } = await ctx.db.from('units').select('label').eq('household_id', ctx.householdId).eq('property_id', input.property_id).in('label', input.labels).is('deleted_at', null);
    if (error) throw new Error(`Reading the units failed: ${error.message}`);
    return data.length === input.labels.length ? unchanged({ added: 0 }) : change(input);
  },
  async apply(ctx, { property_id, labels, list_rent_vnd }) {
    const { data, error } = await ctx.db.rpc('add_rooms', { p_property_id: property_id, p_labels: labels, ...(list_rent_vnd === null ? {} : { p_list_rent_vnd: list_rent_vnd }) });
    return error ? refuse(dbRefusal(error, FUNCTION_SENTINELS)) : { ok: true, value: { added: data } };
  },
});

const reorderInputSchema = z.strictObject({
  property_id: idSchema,
  changes: z.array(z.strictObject({ id: idSchema, sort_order: z.number().int().min(0).max(100_000) })).max(500),
});
export type UnitsMoved = { readonly moved: number };

/** `Lên`, `Xuống` and `Xếp theo số phòng`: every renumbered room in one function call, or none when a room is gone. */
export const unitsReorder = defineOp<z.output<typeof reorderInputSchema>, z.output<typeof reorderInputSchema>, UnitsMoved, UnitRefusal>({
  creates: null,
  input: reorderInputSchema,
  async plan(_ctx, input) {
    return input.changes.length === 0 ? unchanged({ moved: 0 }) : change(input);
  },
  async apply(ctx, { property_id, changes }) {
    const { data, error } = await ctx.db.rpc('reorder_units', { p_property_id: property_id, p_changes: changes });
    return error ? refuse(dbRefusal(error, FUNCTION_SENTINELS)) : { ok: true, value: { moved: data } };
  },
});

export const { remove: unitDelete, restore: unitRestore } = softDeleteOps('units', SENTINELS);
