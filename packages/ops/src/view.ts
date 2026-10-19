import type { Phone } from '@esta/core/phone';
import { tenantSchema } from '@esta/core/schemas/lease';
import { z } from 'zod';
import type { OpContext } from './op';

/** A party as ops read it: its phone is stored the way `normalizePhone` writes it, so it parses back to a `Phone`. */
export const partyRowSchema = z.object({ id: z.string(), full_name: z.string(), phone: tenantSchema.shape.phone.nullable(), id_last4: z.string().nullable() });

/** Per table, what a plan may read of a row that an earlier item in the batch creates. */
export type ViewRows = {
  readonly properties: { readonly id: string; readonly nickname: string };
  readonly units: { readonly id: string; readonly property_id: string; readonly label: string };
  readonly parties: Readonly<z.output<typeof partyRowSchema>>;
};
export type ViewTable = keyof ViewRows;

/** How plans find rows: by id, or by the natural key a create could collide on. */
export type Lookup = {
  readonly properties: { readonly id: string };
  readonly units: { readonly id: string } | { readonly property_id: string; readonly label: string };
  readonly parties: { readonly id: string } | { readonly phone: Phone } | { readonly id_last4: string };
};

type Rows = { readonly [T in ViewTable]: { readonly table: T; readonly row: ViewRows[T] } };
export type PendingRow = Rows[ViewTable];
/** What an op's change will write that a later item may read. */
export type Write = PendingRow & { readonly kind: 'create' };

/** The batch so far as later plans see it, keyed by row id. Only `planChanges` builds one; apply and the web never carry it. */
export type Pending = ReadonlyMap<string, PendingRow>;
export const NO_PENDING: Pending = new Map();

export function withWrites(pending: Pending, writes: readonly Write[]): Pending {
  if (writes.length === 0) return pending;
  const next = new Map(pending);
  for (const write of writes) next.set(write.row.id, write);
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
  parties: async (ctx, where) =>
    partyRowSchema.array().parse(rowsOf(await ctx.db.from('parties').select('id, full_name, phone, id_last4').eq('household_id', ctx.householdId).match(where), 'parties')),
};

function matches(row: Readonly<Record<string, unknown>>, where: object): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

const isOf = <T extends ViewTable>(entry: PendingRow, table: T): entry is Rows[T] => entry.table === table;

/**
 * Rows of `table` in `ctx.householdId` matching `where`, as they will read once the earlier items land: the database's
 * rows, then the pending rows of that table matching `where` that the database did not return.
 */
export async function viewRows<T extends ViewTable>(ctx: ViewContext, table: T, where: Lookup[T]): Promise<readonly ViewRows[T][]> {
  const stored = await READ[table](ctx, where);
  const seen = new Set(stored.map((row) => row.id));
  const planned = [...(ctx.pending?.values() ?? [])].filter((entry) => isOf(entry, table)).map((entry) => entry.row);
  return [...stored, ...planned.filter((row) => !seen.has(row.id) && matches(row, where))];
}
