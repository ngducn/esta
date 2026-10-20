'use server';

import type { Result } from '@esta/core/result';
import { bankAccountCreate, invoiceIssue, invoiceVoid, runOp, type BankAccountRefusal, type CommonRefusal, type InvoiceRefusal } from '@esta/ops';
import { revalidatePath } from 'next/cache';
import { webOpContext } from '@/server/ops';

export type InvoiceActionRefusal = 'reasonRequired' | 'notIssued' | 'notDraft' | 'hasPayments' | 'notFound' | 'failed';

const INVOICE_REFUSALS: Partial<Record<(InvoiceRefusal | CommonRefusal)['kind'], InvoiceActionRefusal>> = {
  not_issued: 'notIssued',
  not_draft: 'notDraft',
  has_payments: 'hasPayments',
  not_found: 'notFound',
};

function revalidateBills() {
  revalidatePath('/collections', 'layout');
  revalidatePath('/properties', 'layout');
}

function invoiceRefusal(reason: InvoiceRefusal | CommonRefusal): InvoiceActionRefusal {
  if (reason.kind === 'invalid') return reason.issues.some((issue) => issue.path === 'reason') ? 'reasonRequired' : 'failed';
  return INVOICE_REFUSALS[reason.kind] ?? 'failed';
}

/** LSE-5 `Hủy hóa đơn`, with the reason Mẹ gave. A repeated tap finds the bill already void and changes nothing. */
export async function voidInvoice(raw: unknown): Promise<Result<undefined, InvoiceActionRefusal>> {
  const result = await runOp(invoiceVoid, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: invoiceRefusal(result.reason) };
  revalidateBills();
  return { ok: true, value: undefined };
}

/** LSE-5 `Phát hành`: the draft issues today on the database clock. */
export async function issueInvoice(raw: unknown): Promise<Result<undefined, InvoiceActionRefusal>> {
  const result = await runOp(invoiceIssue, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: invoiceRefusal(result.reason) };
  revalidateBills();
  return { ok: true, value: undefined };
}

export type AccountActionRefusal = 'bank' | 'accountNo' | 'accountName' | 'duplicate' | 'forbidden' | 'failed';

const FIELD_REFUSALS: Readonly<Record<string, AccountActionRefusal>> = { bank_bin: 'bank', account_no: 'accountNo', account_name: 'accountName' };

function accountRefusal(reason: BankAccountRefusal | CommonRefusal): AccountActionRefusal {
  switch (reason.kind) {
    case 'invalid':
      return reason.issues.map((issue) => FIELD_REFUSALS[issue.path]).find((field) => field !== undefined) ?? 'failed';
    case 'unknown_bank':
      return 'bank';
    case 'duplicate':
    case 'forbidden':
      return reason.kind;
    default:
      return 'failed';
  }
}

/** PLT-1's receiving account, from the sheet a bill offers when the household has none. Only an admin adds one. */
export async function addReceivingAccount(raw: unknown): Promise<Result<undefined, AccountActionRefusal>> {
  const result = await runOp(bankAccountCreate, await webOpContext(), raw);
  if (!result.ok) return { ok: false, reason: accountRefusal(result.reason) };
  revalidateBills();
  return { ok: true, value: undefined };
}
