import 'server-only';
import { getTranslations } from 'next-intl/server';
import type { InvoiceActionLabels } from '@/components/invoices/InvoiceActions';
import type { AccountSheetLabels, BankOption } from '@/components/invoices/ReceivingAccountSheet';
import type { InvoiceActionRefusal } from '@/server/actions/invoices';
import type { AccountActionRefusal } from '@/server/actions/receiving-accounts';
import { createSessionClient } from '@/server/supabase/server';

const INVOICE_REFUSALS = ['reasonRequired', 'notIssued', 'notDraft', 'hasPayments', 'notFound', 'failed'] as const satisfies readonly InvoiceActionRefusal[];
const ACCOUNT_REFUSALS = ['bank', 'accountNo', 'accountName', 'duplicate', 'isDefault', 'inUse', 'numberLocked', 'notFound', 'forbidden', 'failed'] as const satisfies readonly AccountActionRefusal[];

/** The bill's `Phát hành` and `Hủy hóa đơn` words, with the void question naming the bill. */
export async function loadInvoiceActionLabels(number: string): Promise<InvoiceActionLabels> {
  const t = await getTranslations('invoices');
  return {
    issue: t('issue'),
    issuing: t('issuing'),
    voidAction: t('voidAction'),
    voidTitle: t('voidTitle', { number }),
    voidBody: t('voidBody'),
    voidReason: t('voidReason'),
    voiding: t('voiding'),
    keep: t('keep'),
    refusals: Object.fromEntries(INVOICE_REFUSALS.map((reason) => [reason, t('actionRefusal', { reason })])) as Record<InvoiceActionRefusal, string>,
  };
}

/** The account sheet's words and every bank NAPAS lists, by the name payers know it. */
export async function loadAccountSheet(): Promise<{ readonly banks: BankOption[]; readonly labels: AccountSheetLabels }> {
  const [t, supabase] = await Promise.all([getTranslations('invoices'), createSessionClient()]);
  const { data, error } = await supabase.from('bank_bins').select('bin, short_name, name');
  if (error) throw new Error(`Reading the banks failed: ${error.message}`);
  const banks = data
    .map((bank) => ({ value: bank.bin, label: bank.short_name === null ? bank.name : `${bank.short_name} · ${bank.name}` }))
    .toSorted((a, b) => a.label.localeCompare(b.label, 'vi'));
  return {
    banks,
    labels: {
      title: t('accountTitle'),
      body: t('accountBody'),
      addMoreBody: t('accountAddMoreBody'),
      editTitle: t('accountEditTitle'),
      editBody: t('accountEditBody'),
      bank: t('accountBank'),
      bankPick: t('accountBankPick'),
      accountNo: t('accountNo'),
      accountName: t('accountName'),
      accountNameHint: t('accountNameHint'),
      accountNamePreview: t('accountNamePreview'),
      save: t('accountSave'),
      saving: t('accountSaving'),
      close: t('accountClose'),
      refusals: Object.fromEntries(ACCOUNT_REFUSALS.map((reason) => [reason, t('accountRefusal', { reason })])) as Record<AccountActionRefusal, string>,
    },
  };
}
