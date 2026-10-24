'use server';

import type { Result } from '@esta/core/result';
import {
  bankAccountCreate,
  bankAccountDelete,
  bankAccountEdit,
  bankAccountSetDefault,
  runOp,
  type BankAccountRefusal,
  type BankAccountSaved,
  type CommonRefusal,
  type Op,
} from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

export type AccountActionRefusal = 'bank' | 'accountNo' | 'accountName' | 'duplicate' | 'isDefault' | 'inUse' | 'notFound' | 'forbidden' | 'failed';

const FIELD_REFUSALS: Readonly<Record<string, AccountActionRefusal>> = { bank_bin: 'bank', account_no: 'accountNo', account_name: 'accountName' };

const KIND_REFUSALS: Partial<Record<(BankAccountRefusal | CommonRefusal)['kind'], AccountActionRefusal>> = {
  unknown_bank: 'bank',
  duplicate: 'duplicate',
  is_default: 'isDefault',
  in_use: 'inUse',
  not_found: 'notFound',
  forbidden: 'forbidden',
};

function accountRefusal(reason: BankAccountRefusal | CommonRefusal): AccountActionRefusal {
  if (reason.kind === 'invalid') return reason.issues.map((issue) => FIELD_REFUSALS[issue.path]).find((field) => field !== undefined) ?? 'failed';
  return KIND_REFUSALS[reason.kind] ?? 'failed';
}

/** Every bill, the board, Home and Cài đặt read the receiving accounts, so a change redraws them all. */
async function runAccountOp<I, C>(op: Op<I, C, BankAccountSaved, BankAccountRefusal>, raw: unknown): Promise<Result<undefined, AccountActionRefusal>> {
  const result = await runOp(op, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: accountRefusal(result.reason) };
  revalidatePath('/', 'layout');
  return { ok: true, value: undefined };
}

/** PLT-1's receiving account, from Cài đặt or from a bill when the household has none. Only an admin adds one. */
export async function addReceivingAccount(raw: unknown): Promise<Result<undefined, AccountActionRefusal>> {
  return runAccountOp(bankAccountCreate, raw);
}

export async function editReceivingAccount(raw: unknown): Promise<Result<undefined, AccountActionRefusal>> {
  return runAccountOp(bankAccountEdit, raw);
}

export async function setDefaultReceivingAccount(raw: unknown): Promise<Result<undefined, AccountActionRefusal>> {
  return runAccountOp(bankAccountSetDefault, raw);
}

export async function removeReceivingAccount(raw: unknown): Promise<Result<undefined, AccountActionRefusal>> {
  return runAccountOp(bankAccountDelete, raw);
}
