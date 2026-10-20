import { bankAccountName, bankAccountNo } from '@esta/core/vietqr';
import { z } from 'zod';
import { dbRefusal, idSchema } from './kit';
import { change, defineOp, refuse, unchanged, type OpContext } from './op';

const typed = (read: (text: string) => string | null) =>
  z.string().transform((text, ctx) => read(text) ?? (ctx.addIssue({ code: 'custom', message: 'unreadable' }), z.NEVER));

const accountInputSchema = z.strictObject({
  id: idSchema,
  bank_bin: z.string().regex(/^\d{6}$/),
  account_no: typed(bankAccountNo),
  account_name: typed(bankAccountName),
});
type AccountInput = z.output<typeof accountInputSchema>;
type NewAccount = AccountInput & { readonly is_default: boolean };

export type BankAccountSaved = { readonly id: string };
export type BankAccountRefusal = { readonly kind: 'unknown_bank' | 'duplicate' };

async function exists(ctx: OpContext, table: 'bank_accounts' | 'bank_bins', match: Record<string, string | boolean>): Promise<boolean> {
  const scoped = table === 'bank_accounts' ? { ...match, household_id: ctx.householdId } : match;
  const { data, error } = await ctx.db.from(table).select('*').match(scoped).limit(1);
  if (error) throw new Error(`Reading ${table} failed: ${error.message}`);
  return data.length > 0;
}

/**
 * PLT-1's receiving account: where a bill's VietQR sends the money. The household's first account becomes its default.
 * Only an admin adds one; RLS refuses anyone else as `forbidden`. Settings edits and replaces accounts (P6-01).
 */
export const bankAccountCreate = defineOp<AccountInput, NewAccount, BankAccountSaved, BankAccountRefusal>({
  creates: 'bank_accounts',
  input: accountInputSchema,
  async plan(ctx, input) {
    if (await exists(ctx, 'bank_accounts', { id: input.id })) return unchanged({ id: input.id });
    if (!(await exists(ctx, 'bank_bins', { bin: input.bank_bin }))) return refuse({ kind: 'unknown_bank' });
    if (await exists(ctx, 'bank_accounts', { bank_bin: input.bank_bin, account_no: input.account_no })) return refuse({ kind: 'duplicate' });
    return change({ ...input, is_default: !(await exists(ctx, 'bank_accounts', { is_default: true })) });
  },
  async apply(ctx, account) {
    const { error } = await ctx.db.from('bank_accounts').insert({ ...account, household_id: ctx.householdId });
    return error ? refuse(dbRefusal(error)) : { ok: true, value: { id: account.id } };
  },
});
