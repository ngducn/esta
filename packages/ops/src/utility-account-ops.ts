import { identifiedUtilityAccountSchema } from '@esta/core/schemas/units';
import type { Tables } from '@esta/db';
import { z } from 'zod';
import { changedColumns, dbRefusal, idSchema, writtenRow } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';
import { softDeleteOps } from './soft-delete';
import { viewRows } from './view';

const accountInputSchema = z.strictObject({ id: idSchema, property_id: idSchema, account: identifiedUtilityAccountSchema });
type AccountInput = z.output<typeof accountInputSchema>;
export type AccountSaved = { readonly id: string };

const ACCOUNT_KEYS = ['unit_id', 'kind', 'provider', 'customer_code', 'holder_name', 'note'] as const;
type StoredAccount = Pick<Tables<'utility_accounts'>, (typeof ACCOUNT_KEYS)[number]>;

/** A room in the trash is not a room to link to, and neither is one of another property. */
async function unitMissing(ctx: OpContext, { property_id, account }: AccountInput): Promise<boolean> {
  if (account.unit_id === null) return false;
  const [unit] = await viewRows(ctx, 'units', { id: account.unit_id });
  return unit?.property_id !== property_id;
}

const invalidUnit = refuse({ kind: 'invalid' as const, issues: [{ path: 'account.unit_id', code: 'not_found' }] });

export const utilityAccountCreate = defineOp<AccountInput, AccountInput, AccountSaved>({
  creates: 'utility_accounts',
  input: accountInputSchema,
  async plan(ctx, input) {
    const { data, error } = await ctx.db.from('utility_accounts').select('id').eq('household_id', ctx.householdId).eq('id', input.id).maybeSingle();
    if (error) throw new Error(`Reading the utility account failed: ${error.message}`);
    if (data !== null) return unchanged({ id: input.id });
    const [property] = await viewRows(ctx, 'properties', { id: input.property_id });
    if (property === undefined) return refuse({ kind: 'invalid' as const, issues: [{ path: 'property_id', code: 'not_found' }] });
    return (await unitMissing(ctx, input)) ? invalidUnit : change(input);
  },
  async apply(ctx, { id, property_id, account }) {
    const { error } = await ctx.db.from('utility_accounts').insert({ ...account, id, property_id, household_id: ctx.householdId });
    return error ? refuse(dbRefusal(error)) : { ok: true, value: { id } };
  },
});

export const utilityAccountUpdate = defineOp<AccountInput, { readonly id: string; readonly set: Partial<StoredAccount> }, AccountSaved>({
  creates: null,
  input: accountInputSchema,
  async plan(ctx, input) {
    const { data, error } = await ctx.db
      .from('utility_accounts')
      .select('unit_id, kind, provider, customer_code, holder_name, note')
      .eq('household_id', ctx.householdId)
      .eq('property_id', input.property_id)
      .eq('id', input.id)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new Error(`Reading the utility account failed: ${error.message}`);
    if (data === null) return refuse({ kind: 'not_found' });
    const changed = changedColumns<StoredAccount>(data, input.account, ACCOUNT_KEYS);
    if (changed === null) return unchanged({ id: input.id });
    return changed.set.unit_id !== undefined && (await unitMissing(ctx, input)) ? invalidUnit : change({ id: input.id, set: changed.set });
  },
  async apply(ctx, { id, set }) {
    const result = await ctx.db.from('utility_accounts').update(set).eq('household_id', ctx.householdId).eq('id', id).is('deleted_at', null).select('id');
    const written = await writtenRow(id, result, async () => (await ctx.db.from('utility_accounts').select('id').eq('id', id).maybeSingle()).data !== null);
    return written.ok ? { ok: true, value: { id } } : written;
  },
});

export const { remove: utilityAccountDelete, restore: utilityAccountRestore } = softDeleteOps('utility_accounts');
