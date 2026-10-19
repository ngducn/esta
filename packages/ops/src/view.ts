import type { Phone } from '@esta/core/phone';
import type { OpContext } from './op';

export type ViewRows = {
  readonly properties: { readonly id: string; readonly nickname: string };
  readonly units: { readonly id: string; readonly property_id: string; readonly label: string };
  readonly parties: { readonly id: string; readonly full_name: string; readonly phone: string | null; readonly id_last4: string | null };
};
export type ViewTable = keyof ViewRows;

export type Lookup = {
  readonly properties: { readonly id: string };
  readonly units: { readonly id: string } | { readonly property_id: string; readonly label: string };
  readonly parties: { readonly id: string } | { readonly phone: Phone } | { readonly id_last4: string };
};

type Rows = { readonly [T in ViewTable]: { readonly table: T; readonly row: ViewRows[T] } };
export type PendingRow = Rows[ViewTable];
export type Write = PendingRow & { readonly kind: 'create' };

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
  parties: async (ctx, where) => rowsOf(await ctx.db.from('parties').select('id, full_name, phone, id_last4').eq('household_id', ctx.householdId).match(where), 'parties'),
};

function matches(row: Readonly<Record<string, unknown>>, where: object): boolean {
  return Object.entries(where).every(([key, value]) => row[key] === value);
}

const isOf = <T extends ViewTable>(entry: PendingRow, table: T): entry is Rows[T] => entry.table === table;

export async function viewRows<T extends ViewTable>(ctx: ViewContext, table: T, where: Lookup[T]): Promise<readonly ViewRows[T][]> {
  const stored = await READ[table](ctx, where);
  const seen = new Set(stored.map((row) => row.id));
  const planned = [...(ctx.pending?.values() ?? [])].filter((entry) => isOf(entry, table)).map((entry) => entry.row);
  return [...stored, ...planned.filter((row) => !seen.has(row.id) && matches(row, where))];
}
