import type { Result } from '@esta/core/result';
import { bankAccountName, bankAccountNo } from '@esta/core/vietqr';
import { z } from 'zod';
import { changedColumns, dbRefusal, idSchema, type Changed, type CommonRefusal, type DatabaseError } from './kit';
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
type AccountColumns = Omit<AccountInput, 'id'>;
type AccountEdit = { readonly id: string } & Changed<AccountColumns>;

const idInputSchema = z.strictObject({ id: idSchema });
type IdInput = z.output<typeof idInputSchema>;

export type BankAccountSaved = { readonly id: string };
/** `is_default` and `in_use` refuse a removal: bills pay into the default, and a payment keeps the account it landed in. */
export type BankAccountRefusal = { readonly kind: 'unknown_bank' | 'duplicate' | 'is_default' | 'in_use' };

const ACCOUNT_COLUMNS = ['bank_bin', 'account_no', 'account_name'] as const satisfies readonly (keyof AccountColumns)[];

const SENTINELS = { ESTA_BANK_ACCOUNT_NOT_FOUND: { kind: 'not_found' } } as const;

type Table = 'bank_accounts' | 'bank_bins' | 'payments' | 'statement_imports';

async function exists(ctx: OpContext, table: Table, match: Record<string, string | boolean>): Promise<boolean> {
  const scoped = table === 'bank_bins' ? match : { ...match, household_id: ctx.householdId };
  const { data, error } = await ctx.db.from(table).select('*').match(scoped).limit(1);
  if (error) throw new Error(`Reading ${table} failed: ${error.message}`);
  return data.length > 0;
}

type StoredAccount = AccountColumns & { readonly is_default: boolean };

async function stored(ctx: OpContext, id: string): Promise<StoredAccount | null> {
  const { data, error } = await ctx.db.from('bank_accounts').select('bank_bin, account_no, account_name, is_default').eq('household_id', ctx.householdId).eq('id', id).maybeSingle();
  if (error) throw new Error(`Reading the bank account failed: ${error.message}`);
  return data;
}

async function takenByAnother(ctx: OpContext, { id, bank_bin, account_no }: AccountInput): Promise<boolean> {
  const { data, error } = await ctx.db.from('bank_accounts').select('id').eq('household_id', ctx.householdId).eq('bank_bin', bank_bin).eq('account_no', account_no).neq('id', id).limit(1);
  if (error) throw new Error(`Reading bank_accounts failed: ${error.message}`);
  return data.length > 0;
}

type Written = { readonly data: readonly { id: string }[] | null; readonly error: DatabaseError | null };

/** RLS hides a write a non-admin attempts while the row still reads, so no row back from a stored account is `forbidden`. */
async function settled(ctx: OpContext, id: string, { data, error }: Written): Promise<Result<BankAccountSaved, CommonRefusal>> {
  if (error) return refuse(dbRefusal(error));
  if (data !== null && data.length > 0) return { ok: true, value: { id } };
  return refuse((await stored(ctx, id)) === null ? { kind: 'not_found' } : { kind: 'forbidden' });
}

/**
 * PLT-1's receiving account: where a bill's VietQR sends the money. The household's first account becomes its default.
 * Only an admin adds one; RLS refuses anyone else as `forbidden`.
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

/** Corrects the bank, number or name of an account, read as Mẹ types them, as the add sheet reads them. */
export const bankAccountEdit = defineOp<AccountInput, AccountEdit, BankAccountSaved, BankAccountRefusal>({
  creates: null,
  input: accountInputSchema,
  async plan(ctx, input) {
    const current = await stored(ctx, input.id);
    if (current === null) return refuse({ kind: 'not_found' });
    const { id, ...next } = input;
    const changed = changedColumns<AccountColumns>(current, next, ACCOUNT_COLUMNS);
    if (changed === null) return unchanged({ id });
    if ('bank_bin' in changed.set && !(await exists(ctx, 'bank_bins', { bin: input.bank_bin }))) return refuse({ kind: 'unknown_bank' });
    if (('bank_bin' in changed.set || 'account_no' in changed.set) && (await takenByAnother(ctx, input))) return refuse({ kind: 'duplicate' });
    return change({ id, ...changed });
  },
  async apply(ctx, { id, set }) {
    return settled(ctx, id, await ctx.db.from('bank_accounts').update(set).eq('household_id', ctx.householdId).eq('id', id).select('id'));
  },
});

/** Every bill's QR pays into the default from now on; `set_default_bank_account` leaves exactly one. */
export const bankAccountSetDefault = defineOp<IdInput, IdInput, BankAccountSaved, BankAccountRefusal>({
  creates: null,
  input: idInputSchema,
  async plan(ctx, { id }) {
    const current = await stored(ctx, id);
    if (current === null) return refuse({ kind: 'not_found' });
    return current.is_default ? unchanged({ id }) : change({ id });
  },
  async apply(ctx, { id }) {
    const { error } = await ctx.db.rpc('set_default_bank_account', { p_id: id });
    return error ? refuse(dbRefusal(error, SENTINELS)) : { ok: true, value: { id } };
  },
});

/** Removes an account no bill pays into and no payment or statement names; an account already gone plans as unchanged. */
export const bankAccountDelete = defineOp<IdInput, IdInput, BankAccountSaved, BankAccountRefusal>({
  creates: null,
  input: idInputSchema,
  async plan(ctx, { id }) {
    const current = await stored(ctx, id);
    if (current === null) return unchanged({ id });
    if (current.is_default) return refuse({ kind: 'is_default' });
    const named = await Promise.all([exists(ctx, 'payments', { bank_account_id: id }), exists(ctx, 'statement_imports', { bank_account_id: id })]);
    return named.includes(true) ? refuse({ kind: 'in_use' }) : change({ id });
  },
  async apply(ctx, { id }) {
    return settled(ctx, id, await ctx.db.from('bank_accounts').delete().eq('household_id', ctx.householdId).eq('id', id).select('id'));
  },
});
