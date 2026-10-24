'use server';

import { moveUnit, sortByRoomNumber, type SortChange } from '@esta/core/properties';
import type { Result } from '@esta/core/result';
import { addRoomsSchema, unitSchema, utilityAccountSchema, type Unit } from '@esta/core/schemas/units';
import { runOp, unitCreate, type CommonRefusal, type UnitRefusal } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { webOpContext } from '@/server/ops';
import { ACCOUNT_COLUMNS, UNIT_COLUMNS, loadPropertyRental } from '@/server/properties/rental';
import { createSessionClient } from '@/server/supabase/server';

type RentalRefusal = 'invalid' | 'duplicate' | 'wholeLeased' | 'failed';
export type RentalWrite = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: RentalRefusal };

/** What a delete hands back, so `Hoàn tác` puts the row back under its own id and re-links its accounts. */
export type DeletedUnit = { readonly propertyId: string; readonly row: { readonly id: string } & Record<string, unknown>; readonly accounts: readonly string[] };
export type DeletedAccount = { readonly propertyId: string; readonly row: { readonly id: string } & Record<string, unknown> };

const uuid = z.uuid();
const UNIQUE_VIOLATION = '23505';
const REFUSED = new Set(['23503', '23514', '22P02']);

/** `ESTA_WHOLE_UNIT_LEASED` comes from the leases migration: a room would replace a whole unit that has a lease. */
function failure({ code, message }: { code?: string; message?: string }): RentalWrite {
  if (message === 'ESTA_WHOLE_UNIT_LEASED') return { ok: false, reason: 'wholeLeased' };
  if (code === UNIQUE_VIOLATION) return { ok: false, reason: 'duplicate' };
  return { ok: false, reason: code !== undefined && REFUSED.has(code) ? 'invalid' : 'failed' };
}

/** The list cards show rent and the `Trống` mark, so a unit write refreshes the list as well as the property. */
function revalidateRental() {
  revalidatePath('/properties', 'layout');
}

async function scope(propertyId: unknown) {
  const property = uuid.safeParse(propertyId);
  if (!property.success) return null;
  const [member, supabase] = await Promise.all([requireMember(), createSessionClient()]);
  return { supabase, match: { household_id: member.household.id, property_id: property.data } };
}

async function nextSortOrder(propertyId: string): Promise<number> {
  const { units } = await loadPropertyRental(propertyId);
  return Math.max(-1, ...units.map((unit) => unit.sort_order)) + 1;
}

const CREATE_REFUSED: Readonly<Record<(UnitRefusal | CommonRefusal)['kind'], RentalRefusal>> = {
  label_taken: 'duplicate',
  conflict: 'duplicate',
  whole_unit_leased: 'wholeLeased',
  invalid: 'invalid',
  not_found: 'invalid',
  forbidden: 'failed',
  failed: 'failed',
};

export async function saveUnit(propertyId: unknown, unitId: unknown, raw: unknown): Promise<RentalWrite> {
  if (unitId === null) {
    const created = await runOp(unitCreate, await webOpContext(), { id: randomUUID(), property_id: propertyId, unit: raw });
    if (!created.ok) return { ok: false, reason: CREATE_REFUSED[created.reason.kind] };
    revalidateRental();
    return { ok: true, id: created.value.id };
  }
  const target = await scope(propertyId);
  const item = uuid.safeParse(unitId);
  const value = unitSchema.safeParse(raw);
  if (target === null || !item.success || !value.success) return { ok: false, reason: 'invalid' };
  const { supabase, match } = target;
  const { data, error } = await supabase.from('units').update(value.data).match(match).eq('id', item.data).select('id').maybeSingle();
  if (error) return failure(error);
  if (data === null) return { ok: false, reason: 'failed' };
  revalidateRental();
  return { ok: true, id: data.id };
}

/**
 * The labels come from `nextRoomLabels` when the sheet opened, and a label that already exists is skipped, so a
 * second tap or a retry after a lost response adds no room.
 */
export async function addRooms(propertyId: unknown, raw: unknown): Promise<RentalWrite> {
  const target = await scope(propertyId);
  const value = addRoomsSchema.safeParse(raw);
  if (target === null || !value.success) return { ok: false, reason: 'invalid' };
  const { supabase, match } = target;
  const first = await nextSortOrder(match.property_id);
  const rows = value.data.labels.map((label, index) => ({
    ...match,
    label,
    kind: 'room',
    list_rent_vnd: value.data.list_rent_vnd,
    sort_order: first + index,
  }));
  const { error } = await supabase.from('units').upsert(rows, { onConflict: 'property_id,label', ignoreDuplicates: true });
  if (error) return failure(error);
  revalidateRental();
  return { ok: true, id: match.property_id };
}

const directionSchema = z.enum(['up', 'down']);

async function reorderUnits(propertyId: unknown, order: (units: readonly Unit[]) => SortChange[]): Promise<RentalWrite> {
  const target = await scope(propertyId);
  if (target === null) return { ok: false, reason: 'invalid' };
  const { supabase, match } = target;
  const { units } = await loadPropertyRental(match.property_id);
  for (const change of order(units)) {
    const { error } = await supabase.from('units').update({ sort_order: change.sort_order }).match(match).eq('id', change.id);
    if (error) return failure(error);
  }
  revalidateRental();
  return { ok: true, id: match.property_id };
}

export async function moveUnitAction(propertyId: unknown, unitId: unknown, direction: unknown): Promise<RentalWrite> {
  const item = uuid.safeParse(unitId);
  const way = directionSchema.safeParse(direction);
  if (!item.success || !way.success) return { ok: false, reason: 'invalid' };
  return reorderUnits(propertyId, (units) => moveUnit(units, item.data, way.data));
}

export async function sortUnitsByRoomNumber(propertyId: unknown): Promise<RentalWrite> {
  return reorderUnits(propertyId, sortByRoomNumber);
}

export type UnitDelete = { readonly ok: true; readonly deleted: DeletedUnit } | { readonly ok: false; readonly hasLeases?: true };

/** The `whole` unit has no delete: the database brings it back whenever a property would be left with none. */
export async function deleteUnit(propertyId: unknown, unitId: unknown): Promise<UnitDelete> {
  const target = await scope(propertyId);
  const item = uuid.safeParse(unitId);
  if (target === null || !item.success) return { ok: false };
  const { supabase, match } = target;
  const linked = await supabase.from('utility_accounts').select('id').match(match).eq('unit_id', item.data);
  if (linked.error) return { ok: false };
  const { data, error } = await supabase.from('units').delete().match(match).eq('id', item.data).neq('kind', 'whole').select(UNIT_COLUMNS).maybeSingle();
  if (error?.message === 'ESTA_UNIT_HAS_LEASES') return { ok: false, hasLeases: true };
  if (error || data === null) return { ok: false };
  revalidateRental();
  return { ok: true, deleted: { propertyId: match.property_id, row: data, accounts: linked.data.map((row) => row.id) } };
}

const deletedUnitSchema = z.object({
  propertyId: uuid,
  row: unitSchema.extend({ id: uuid, sort_order: z.number().int().min(0).max(100_000) }),
  accounts: z.array(uuid).max(200),
});

/** Inserts under the row's own id with `on conflict (id) do nothing`, then re-links only accounts still unlinked. */
export async function restoreUnit(raw: unknown): Promise<RentalWrite> {
  const deleted = deletedUnitSchema.safeParse(raw);
  if (!deleted.success) return { ok: false, reason: 'invalid' };
  const target = await scope(deleted.data.propertyId);
  if (target === null) return { ok: false, reason: 'invalid' };
  const { supabase, match } = target;
  const { row, accounts } = deleted.data;
  const { error } = await supabase.from('units').upsert({ ...row, ...match }, { onConflict: 'id', ignoreDuplicates: true });
  if (error) return failure(error);
  if (accounts.length > 0) {
    const relink = await supabase.from('utility_accounts').update({ unit_id: row.id }).match(match).in('id', accounts).is('unit_id', null);
    if (relink.error) return failure(relink.error);
  }
  revalidateRental();
  return { ok: true, id: row.id };
}

export async function saveAccount(propertyId: unknown, accountId: unknown, raw: unknown): Promise<RentalWrite> {
  const target = await scope(propertyId);
  const item = accountId === null ? { success: true as const, data: null } : uuid.safeParse(accountId);
  const value = utilityAccountSchema.safeParse(raw);
  if (target === null || !item.success || !value.success) return { ok: false, reason: 'invalid' };
  const { supabase, match } = target;
  const { data, error } =
    item.data === null
      ? await supabase.from('utility_accounts').insert({ ...value.data, ...match }).select('id').single()
      : await supabase.from('utility_accounts').update(value.data).match(match).eq('id', item.data).select('id').maybeSingle();
  if (error) return failure(error);
  if (data === null) return { ok: false, reason: 'failed' };
  revalidateRental();
  return { ok: true, id: data.id };
}

export type AccountDelete = Result<DeletedAccount>;

export async function deleteAccount(propertyId: unknown, accountId: unknown): Promise<AccountDelete> {
  const target = await scope(propertyId);
  const item = uuid.safeParse(accountId);
  if (target === null || !item.success) return { ok: false, reason: 'failed' };
  const { supabase, match } = target;
  const { data, error } = await supabase.from('utility_accounts').delete().match(match).eq('id', item.data).select(ACCOUNT_COLUMNS).maybeSingle();
  if (error || data === null) return { ok: false, reason: 'failed' };
  revalidateRental();
  return { ok: true, value: { propertyId: match.property_id, row: data } };
}

const deletedAccountSchema = z.object({ propertyId: uuid, row: utilityAccountSchema.extend({ id: uuid }) });

/** A unit deleted since is gone, so the account comes back at property level rather than failing. */
export async function restoreAccount(raw: unknown): Promise<RentalWrite> {
  const deleted = deletedAccountSchema.safeParse(raw);
  if (!deleted.success) return { ok: false, reason: 'invalid' };
  const target = await scope(deleted.data.propertyId);
  if (target === null) return { ok: false, reason: 'invalid' };
  const { supabase, match } = target;
  const { row } = deleted.data;
  const insert = async (unitId: string | null) =>
    supabase.from('utility_accounts').upsert({ ...row, unit_id: unitId, ...match }, { onConflict: 'id', ignoreDuplicates: true });
  let { error } = await insert(row.unit_id);
  if (error?.code === '23503' && row.unit_id !== null) ({ error } = await insert(null));
  if (error) return failure(error);
  revalidateRental();
  return { ok: true, id: row.id };
}
