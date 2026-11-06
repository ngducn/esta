import { z } from 'zod';
import { idSchema, writtenRow, type Refusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

/**
 * The one undo model (Q-03): a row the user deletes stays, with `deleted_at` set, and `Hoàn tác` clears it on the same
 * row. A table joins by calling `private.enable_soft_delete` in its migration and by being listed here.
 * `soft-delete.test.ts` fails when a table listed here has no `enable_soft_delete` call; `rental_soft_delete.test.sql`
 * fails when any public table with a `deleted_at` column keeps a DELETE or ALL policy. Neither fails a table that is
 * soft deleted but missing from this list.
 */
export const SOFT_DELETE_TABLES = ['units', 'utility_accounts'] as const;
export type SoftDeleteTable = (typeof SOFT_DELETE_TABLES)[number];

const inputSchema = z.strictObject({ id: idSchema });
export type Trashed = { readonly id: string };

/**
 * `remove` stamps `deleted_at` from the Clock and `restore` clears it; either plans as unchanged when the row already is
 * where it is asked to go, so a second tap or a retry after a lost response does nothing. `sentinels` are the table's
 * own refusals, raised by its triggers (a room with leases cannot be deleted).
 */
export function softDeleteOps<R extends Refusal = never>(table: SoftDeleteTable, sentinels: Readonly<Record<string, R>> = {}) {
  const read = (ctx: OpContext, id: string) => ctx.db.from(table).select('id, deleted_at').eq('household_id', ctx.householdId).eq('id', id).maybeSingle();
  const toggle = (trash: boolean) =>
    defineOp<z.output<typeof inputSchema>, Trashed, Trashed, R>({
      creates: null,
      input: inputSchema,
      async plan(ctx, { id }) {
        const { data, error } = await read(ctx, id);
        if (error) throw new Error(`Reading ${table} failed: ${error.message}`);
        if (data === null) return refuse({ kind: 'not_found' });
        return (data.deleted_at !== null) === trash ? unchanged({ id }) : change({ id });
      },
      async apply(ctx, { id }) {
        const written = await writtenRow(
          id,
          await ctx.db.from(table).update({ deleted_at: trash ? ctx.clock.now() : null }).eq('household_id', ctx.householdId).eq('id', id).select('id'),
          async () => (await read(ctx, id)).data !== null,
          sentinels,
        );
        return written.ok ? { ok: true, value: { id } } : written;
      },
    });
  return { remove: toggle(true), restore: toggle(false) };
}
