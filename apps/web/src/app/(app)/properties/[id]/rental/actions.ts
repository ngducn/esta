'use server';

import { moveUnit, sortByRoomNumber, type SortChange } from '@esta/core/properties';
import type { Result } from '@esta/core/result';
import type { Unit } from '@esta/core/schemas/units';
import {
  runOp,
  unitAddRooms,
  unitCreate,
  unitDelete,
  unitRestore,
  unitsReorder,
  unitUpdate,
  utilityAccountCreate,
  utilityAccountDelete,
  utilityAccountRestore,
  utilityAccountUpdate,
  idSchema,
  type CommonRefusal,
  type Op,
  type Trashed,
  type UnitRefusal,
} from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { webOpContext } from '@/server/ops';
import { loadPropertyRental } from '@/server/properties/rental';

type RentalRefusal = 'invalid' | 'duplicate' | 'wholeLeased' | 'failed';
export type RentalWrite = { readonly ok: true; readonly id: string } | { readonly ok: false; readonly reason: RentalRefusal };

const REFUSED: Readonly<Record<(UnitRefusal | CommonRefusal)['kind'], RentalRefusal>> = {
  label_taken: 'duplicate',
  conflict: 'duplicate',
  whole_unit_leased: 'wholeLeased',
  invalid: 'invalid',
  not_found: 'invalid',
  forbidden: 'failed',
  failed: 'failed',
  unit_has_leases: 'failed',
  units_changed: 'failed',
};

/** The list cards show rent and the `Trống` mark, so a unit write refreshes the list as well as the property. */
function revalidateRental() {
  revalidatePath('/properties', 'layout');
}

async function write<I, C, O>(op: Op<I, C, O, UnitRefusal>, raw: unknown, idOf: (output: O) => string): Promise<RentalWrite> {
  const result = await runOp(op, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: REFUSED[result.reason.kind] };
  revalidateRental();
  return { ok: true, id: idOf(result.value) };
}

export async function saveUnit(propertyId: unknown, unitId: unknown, raw: unknown): Promise<RentalWrite> {
  if (unitId === null) return write(unitCreate, { id: randomUUID(), property_id: propertyId, unit: raw }, ({ id }) => id);
  return write(unitUpdate, { id: unitId, property_id: propertyId, unit: raw }, ({ id }) => id);
}

/** The labels come from `nextRoomLabels` when the sheet opened, and a label that already exists is skipped, so a second tap or a retry adds no room. */
export async function addRooms(propertyId: unknown, raw: unknown): Promise<RentalWrite> {
  const input = typeof raw === 'object' && raw !== null ? { ...raw, property_id: propertyId } : raw;
  return write(unitAddRooms, input, () => idSchema.parse(propertyId));
}

const directionSchema = z.enum(['up', 'down']);

/** `null` from `order` refuses the request; an empty list is a move that changes nothing. */
async function reorderUnits(propertyId: unknown, order: (units: readonly Unit[]) => SortChange[] | null): Promise<RentalWrite> {
  const property = idSchema.safeParse(propertyId);
  if (!property.success) return { ok: false, reason: 'invalid' };
  const { units } = await loadPropertyRental(property.data);
  const changes = units.length === 0 ? null : order(units);
  if (changes === null) return { ok: false, reason: 'failed' };
  return write(unitsReorder, { property_id: property.data, changes }, () => property.data);
}

export async function moveUnitAction(propertyId: unknown, unitId: unknown, direction: unknown): Promise<RentalWrite> {
  const item = idSchema.safeParse(unitId);
  const way = directionSchema.safeParse(direction);
  if (!item.success || !way.success) return { ok: false, reason: 'invalid' };
  return reorderUnits(propertyId, (units) => (units.some((unit) => unit.id === item.data) ? moveUnit(units, item.data, way.data) : null));
}

export async function sortUnitsByRoomNumber(propertyId: unknown): Promise<RentalWrite> {
  return reorderUnits(propertyId, sortByRoomNumber);
}

export type UnitDelete = { readonly ok: true; readonly deleted: Trashed } | { readonly ok: false; readonly hasLeases?: true };

/** The `whole` unit has no delete: the database refuses it, and brings it back whenever a property would be left with none. */
export async function deleteUnit(unitId: unknown): Promise<UnitDelete> {
  const result = await runOp(unitDelete, await webOpContext(), { id: unitId });
  if (!result.ok) return result.reason.kind === 'unit_has_leases' ? { ok: false, hasLeases: true } : { ok: false };
  revalidateRental();
  return { ok: true, deleted: result.value };
}

export async function restoreUnit(deleted: Trashed): Promise<RentalWrite> {
  return write(unitRestore, deleted, ({ id }) => id);
}

export async function saveAccount(propertyId: unknown, accountId: unknown, raw: unknown): Promise<RentalWrite> {
  if (accountId === null) return write(utilityAccountCreate, { id: randomUUID(), property_id: propertyId, account: raw }, ({ id }) => id);
  return write(utilityAccountUpdate, { id: accountId, property_id: propertyId, account: raw }, ({ id }) => id);
}

export type AccountDelete = Result<Trashed>;

export async function deleteAccount(accountId: unknown): Promise<AccountDelete> {
  const result = await runOp(utilityAccountDelete, await webOpContext(), { id: accountId });
  if (!result.ok) return { ok: false, reason: 'failed' };
  revalidateRental();
  return { ok: true, value: result.value };
}

export async function restoreAccount(deleted: Trashed): Promise<RentalWrite> {
  return write(utilityAccountRestore, deleted, ({ id }) => id);
}
