'use server';

import { moveUnit } from '@esta/core/properties';
import { addRoomsSchema, unitSchema, utilityAccountSchema } from '@esta/core/schemas/units';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireMember } from '@/server/member';
import { ACCOUNT_COLUMNS, UNIT_COLUMNS, loadPropertyRental } from '@/server/properties/rental';
import { createSessionClient } from '@/server/supabase/server';

export type RentalWrite =
  | { readonly ok: true; readonly id: string }
  | { readonly ok: false; readonly reason: 'invalid' | 'duplicate' | 'failed' };

/** What a delete hands back, so `Hoàn tác` puts the row back under its own id and re-links its accounts. */
export type DeletedUnit = { readonly propertyId: string; readonly row: { readonly id: string } & Record<string, unknown>; readonly accounts: readonly string[] };
export type DeletedAccount = { readonly propertyId: string; readonly row: { readonly id: string } & Record<string, unknown> };

const uuid = z.uuid();
const UNIQUE_VIOLATION = '23505';
const REFUSED = new Set(['23503', '23514', '22P02']);

function failure(code: string | undefined): RentalWrite {
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

export async function saveUnit(propertyId: unknown, unitId: unknown, raw: unknown): Promise<RentalWrite> {
  const target = await scope(propertyId);
  const item = unitId === null ? { success: true as const, data: null } : uuid.safeParse(unitId);
  const value = unitSchema.safeParse(raw);
  if (target === null || !item.success || !value.success) return { ok: false, reason: 'invalid' };
  const { supabase, match } = target;
  const { data, error } =
    item.data === null
      ? await supabase
          .from('units')
          .insert({ ...value.data, ...match, sort_order: await nextSortOrder(match.property_id) })
          .select('id')
          .single()
      : await supabase.from('units').update(value.data).match(match).eq('id', item.data).select('id').maybeSingle();
  if (error) return failure(error.code);
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
  if (error) return failure(error.code);
  revalidateRental();
  return { ok: true, id: match.property_id };
}

const directionSchema = z.enum(['up', 'down']);

export async function moveUnitAction(propertyId: unknown, unitId: unknown, direction: unknown): Promise<RentalWrite> {
  const target = await scope(propertyId);
  const item = uuid.safeParse(unitId);
  const way = directionSchema.safeParse(direction);
  if (target === null || !item.success || !way.success) return { ok: false, reason: 'invalid' };
  const { supabase, match } = target;
  const { units } = await loadPropertyRental(match.property_id);
  for (const change of moveUnit(units, item.data, way.data)) {
    const { error } = await supabase.from('units').update({ sort_order: change.sort_order }).match(match).eq('id', change.id);
    if (error) return failure(error.code);
  }
  revalidateRental();
  return { ok: true, id: item.data };
}

export type UnitDelete = { readonly ok: true; readonly deleted: DeletedUnit } | { readonly ok: false };

/** The `whole` unit has no delete: the database brings it back whenever a property would be left with none. */
export async function deleteUnit(propertyId: unknown, unitId: unknown): Promise<UnitDelete> {
  const target = await scope(propertyId);
  const item = uuid.safeParse(unitId);
  if (target === null || !item.success) return { ok: false };
  const { supabase, match } = target;
  const linked = await supabase.from('utility_accounts').select('id').match(match).eq('unit_id', item.data);
  if (linked.error) return { ok: false };
  const { data, error } = await supabase.from('units').delete().match(match).eq('id', item.data).neq('kind', 'whole').select(UNIT_COLUMNS).maybeSingle();
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
  if (error) return failure(error.code);
  if (accounts.length > 0) {
    const relink = await supabase.from('utility_accounts').update({ unit_id: row.id }).match(match).in('id', accounts).is('unit_id', null);
    if (relink.error) return failure(relink.error.code);
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
  if (error) return failure(error.code);
  if (data === null) return { ok: false, reason: 'failed' };
  revalidateRental();
  return { ok: true, id: data.id };
}

export type AccountDelete = { readonly ok: true; readonly deleted: DeletedAccount } | { readonly ok: false };

export async function deleteAccount(propertyId: unknown, accountId: unknown): Promise<AccountDelete> {
  const target = await scope(propertyId);
  const item = uuid.safeParse(accountId);
  if (target === null || !item.success) return { ok: false };
  const { supabase, match } = target;
  const { data, error } = await supabase.from('utility_accounts').delete().match(match).eq('id', item.data).select(ACCOUNT_COLUMNS).maybeSingle();
  if (error || data === null) return { ok: false };
  revalidateRental();
  return { ok: true, deleted: { propertyId: match.property_id, row: data } };
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
  if (error) return failure(error.code);
  revalidateRental();
  return { ok: true, id: row.id };
}
