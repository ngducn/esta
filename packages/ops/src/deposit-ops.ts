import { DEPOSIT_KINDS } from '@esta/core/allocation';
import { formatDate, formatVnd } from '@esta/core/format';
import { MAX_AMOUNT_VND, vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import { dbRefusal, idSchema, type CommonRefusal } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { viewRows } from './view';

/** Applying the deposit to a bill stays in `recordDeposit` on `apply_deposit` until #188. */
const depositInputSchema = z.strictObject({
  id: idSchema,
  lease_id: idSchema,
  kind: z.enum(DEPOSIT_KINDS).exclude(['applied']),
  amount_vnd: z.number().int().min(1).max(MAX_AMOUNT_VND),
  on_date: isoDateSchema,
  note: z.string().max(1000).nullable().default(null),
});
type DepositEntry = z.output<typeof depositInputSchema>;
export type DepositRecorded = { readonly entry_id: string };
export type DepositRefusal = { readonly kind: 'not_active' | 'date_after_today' | 'note_required' | 'exceeds_held' };

const SENTINELS: Readonly<Record<string, DepositRefusal | CommonRefusal>> = {
  ESTA_LEASE_NOT_FOUND: { kind: 'not_found' },
  ESTA_LEASE_NOT_ACTIVE: { kind: 'not_active' },
  ESTA_DEPOSIT_KEY_MISSING: { kind: 'invalid', issues: [{ path: 'id', code: 'invalid_type' }] },
  ESTA_DEPOSIT_KIND: { kind: 'invalid', issues: [{ path: 'kind', code: 'invalid_value' }] },
  ESTA_DEPOSIT_AMOUNT: { kind: 'invalid', issues: [{ path: 'amount_vnd', code: 'too_small' }] },
  ESTA_DEPOSIT_DATE_AFTER_TODAY: { kind: 'date_after_today' },
  ESTA_DEPOSIT_NOTE_REQUIRED: { kind: 'note_required' },
  ESTA_DEPOSIT_EXCEEDS_HELD: { kind: 'exceeds_held' },
};

async function entryWithKey(ctx: OpContext, key: string): Promise<string | null> {
  const { data, error } = await ctx.db.from('deposit_entries').select('id').eq('household_id', ctx.householdId).eq('idempotency_key', key).maybeSingle();
  if (error) throw new Error(`Reading the deposit entry failed: ${error.message}`);
  return data?.id ?? null;
}

async function heldOf(ctx: OpContext, leaseId: string): Promise<number> {
  const { data, error } = await ctx.db.from('lease_deposits').select('held_vnd').eq('household_id', ctx.householdId).eq('lease_id', leaseId).maybeSingle();
  if (error) throw new Error(`Reading the held deposit failed: ${error.message}`);
  return data?.held_vnd ?? 0;
}

/**
 * LSE-9: a deposit received, deducted for a stated reason, or refunded. `id` is the entry's idempotency key, so a key
 * already written plans as unchanged, whatever the rest says, as `record_deposit_entry` treats it. The amount ceiling,
 * the date and the held balance are that function's rules.
 */
export const depositRecord = defineOp<DepositEntry, DepositEntry, DepositRecorded, DepositRefusal>({
  creates: 'deposit_entries',
  input: depositInputSchema,
  async plan(ctx, entry) {
    const seen = await entryWithKey(ctx, entry.id);
    if (seen !== null) return unchanged({ entry_id: seen });
    const [lease] = await viewRows(ctx, 'leases', { id: entry.lease_id });
    if (lease === undefined) return refuse({ kind: 'not_found' });
    // An ended or terminated lease still refunds its deposit; only a draft holds none.
    return lease.status === 'draft' ? refuse({ kind: 'not_active' }) : change(entry);
  },
  async apply(ctx, { id, lease_id, kind, amount_vnd, on_date, note }) {
    const { data, error } = await ctx.db.rpc('record_deposit_entry', {
      p_lease_id: lease_id,
      p_kind: kind,
      p_amount_vnd: amount_vnd,
      p_on_date: on_date,
      p_idempotency_key: id,
      ...(note === null ? {} : { p_note: note }),
    });
    return error ? refuse(dbRefusal(error, SENTINELS)) : { ok: true, value: { entry_id: data } };
  },
  async preview(ctx, { lease_id, kind, amount_vnd, on_date }) {
    const held = await heldOf(ctx, lease_id);
    return {
      amount_display: formatVnd(vnd(amount_vnd), 'vi'),
      on_date_display: formatDate(on_date, 'vi'),
      held_after_display: formatVnd(vnd(kind === 'received' ? held + amount_vnd : held - amount_vnd), 'vi'),
    };
  },
});
