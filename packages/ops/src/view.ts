import type { Phone } from '@esta/core/phone';
import { leaseDraftSchema, leaseRowSchema } from '@esta/core/schemas/lease';
import { z } from 'zod';
import type { OpContext } from './op';

/** A lease as activation and a deposit read it: its draft terms, its property, status and paid-through date. */
const leaseViewSchema = leaseRowSchema.omit({ terminated_on: true, termination_reason: true, renewal_of_lease_id: true });
const LEASE_VIEW_COLUMNS = Object.keys(leaseViewSchema.shape).join(', ');
export const LEASE_DRAFT_KEYS = leaseDraftSchema.keyof().options;

export type ViewRows = {
  readonly properties: { readonly id: string; readonly nickname: string };
  readonly units: { readonly id: string; readonly property_id: string; readonly label: string };
  readonly parties: { readonly id: string; readonly full_name: string; readonly phone: string | null; readonly id_last4: string | null };
  readonly leases: z.output<typeof leaseViewSchema>;
};
export type ViewTable = keyof ViewRows;

/** Leases, the one table a batch item sets, are found by id alone, so a set never moves a row across a filter. */
export type Lookup = {
  readonly properties: { readonly id: string };
  readonly units: { readonly id: string } | { readonly property_id: string; readonly label: string };
  readonly parties: { readonly id: string } | { readonly phone: Phone } | { readonly id_last4: string };
  readonly leases: { readonly id: string };
};

type Rows = { readonly [T in ViewTable]: { readonly table: T; readonly row: ViewRows[T] } };
export type LeaseSet = Partial<Omit<ViewRows['leases'], 'id' | 'property_id'>>;
/** A set on a lease the database holds, merged onto the row a read returns. */
type LeaseOverlay = { readonly table: 'leases'; readonly set: LeaseSet };
export type PendingRow = Rows[ViewTable] | LeaseOverlay;
export type Write = (Rows[ViewTable] & { readonly kind: 'create' }) | { readonly kind: 'set'; readonly table: 'leases'; readonly id: string; readonly set: LeaseSet };

export type Pending = ReadonlyMap<string, PendingRow>;
export const NO_PENDING: Pending = new Map();

function overlaid(entry: PendingRow | undefined, set: LeaseSet): PendingRow {
  if (entry?.table === 'leases' && 'row' in entry) return { table: 'leases', row: { ...entry.row, ...set } };
  return { table: 'leases', set: { ...(entry !== undefined && 'set' in entry ? entry.set : {}), ...set } };
}

export function withWrites(pending: Pending, writes: readonly Write[]): Pending {
  if (writes.length === 0) return pending;
  const next = new Map(pending);
  for (const write of writes) {
    if (write.kind === 'create') next.set(write.row.id, write);
    else next.set(write.id, overlaid(next.get(write.id), write.set));
  }
  return next;
}

export type ViewContext = Pick<OpContext, 'db' | 'householdId' | 'pending'>;

function rowsOf<R>(read: { readonly data: R[] | null; readonly error: { readonly message: string } | null }, table: ViewTable): R[] {
  if (read.error) throw new Error(`Reading ${table} failed: ${read.error.message}`);
  return read.data ?? [];
}

const READ: { readonly [T in ViewTable]: (ctx: ViewContext, where: Lookup[T]) => Promise<readonly ViewRows[T][]> } = {
  properties: async (ctx, where) => rowsOf(await ctx.db.from('properties').select('id, nickname').eq('household_id', ctx.householdId).match(where), 'properties'),
  units: async (ctx, where) => rowsOf(await ctx.db.from('units').select('id, property_id, label').eq('household_id', ctx.householdId).match(where), 'units'),
  parties: async (ctx, where) => rowsOf(await ctx.db.from('parties').select('id, full_name, phone, id_last4').eq('household_id', ctx.householdId).match(where), 'parties'),
  leases: async (ctx, where) => {
    const stored = rowsOf(await ctx.db.from('leases').select(LEASE_VIEW_COLUMNS).eq('household_id', ctx.householdId).match(where), 'leases');
    return z
      .array(leaseViewSchema)
      .parse(stored)
      .map((row) => {
        const entry = ctx.pending?.get(row.id);
        return entry !== undefined && 'set' in entry ? { ...row, ...entry.set } : row;
      });
  },
};

function matches(row: Readonly<Record<string, unknown>>, where: object): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

const isOf = <T extends ViewTable>(entry: PendingRow, table: T): entry is Rows[T] => 'row' in entry && entry.table === table;

export async function viewRows<T extends ViewTable>(ctx: ViewContext, table: T, where: Lookup[T]): Promise<readonly ViewRows[T][]> {
  const stored = await READ[table](ctx, where);
  const seen = new Set(stored.map((row) => row.id));
  const planned = [...(ctx.pending?.values() ?? [])].filter((entry) => isOf(entry, table)).map((entry) => entry.row);
  return [...stored, ...planned.filter((row) => !seen.has(row.id) && matches(row, where))];
}
