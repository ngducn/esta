import { z } from 'zod';
import { dbRefusal, idSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse } from './op';

export const UNDO_REASONS = [
  'edited_after',
  'lease_started',
  'invoice_issued',
  'payment_recorded',
  'deposit_recorded',
  'in_use',
  'deposit_later',
  'payment_later',
  'statement_matched',
] as const;
export const UNDO_FLOWS = ['void', 'end_lease', 'edit', 'deposit', 'payment'] as const;

const blockerSchema = z.object({ table_name: z.string(), row_id: idSchema, reason: z.enum(UNDO_REASONS), flow: z.enum(UNDO_FLOWS) });
const undoneSchema = z.discriminatedUnion('undone', [
  z.object({ undone: z.literal(true), archived: z.array(z.object({ table_name: z.string(), row_id: idSchema })) }),
  z.object({ undone: z.literal(false), blockers: z.array(blockerSchema).min(1) }),
]);

export type UndoBlocker = z.output<typeof blockerSchema>;
export type BatchUndone = { readonly batch_id: string; readonly archived_properties: number };
export type UndoRefusal = { readonly kind: 'undo_blocked'; readonly blockers: readonly UndoBlocker[] } | { readonly kind: 'not_undoable'; readonly status: string };

const SENTINELS: Readonly<Record<string, UndoRefusal | CommonRefusal>> = {
  ESTA_BATCH_NOT_FOUND: { kind: 'not_found' },
  ESTA_BATCH_NOT_UNDOABLE: { kind: 'not_undoable', status: 'undone' },
};

const inputSchema = z.strictObject({ batch_id: idSchema });
type UndoInput = z.output<typeof inputSchema>;

export const batchUndo = defineOp<UndoInput, UndoInput, BatchUndone, UndoRefusal>({
  creates: null,
  input: inputSchema,
  async plan(ctx, { batch_id }) {
    const { data, error } = await ctx.db.from('change_batches').select('status').eq('household_id', ctx.householdId).eq('id', batch_id).maybeSingle();
    if (error) throw new Error(`Reading the batch failed: ${error.message}`);
    if (data === null) return refuse({ kind: 'not_found' });
    return data.status === 'applied' || data.status === 'partial' ? change({ batch_id }) : refuse({ kind: 'not_undoable', status: data.status });
  },
  async apply(ctx, { batch_id }) {
    const { data, error } = await ctx.db.rpc('undo_change_batch', { p_batch_id: batch_id });
    if (error) return refuse(dbRefusal(error, SENTINELS));
    const result = undoneSchema.parse(data);
    if (!result.undone) return refuse({ kind: 'undo_blocked', blockers: result.blockers });
    return { ok: true, value: { batch_id, archived_properties: result.archived.filter((row) => row.table_name === 'properties').length } };
  },
});
