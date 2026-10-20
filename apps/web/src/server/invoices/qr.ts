import 'server-only';
import { formatVnd, vndInWords, type Locale } from '@esta/core/format';
import type { Vnd } from '@esta/core/money';
import { buildInvoiceQr, invoiceMemo, VIETQR_RULES, type ReceivingAccount } from '@esta/core/vietqr';
import { getLocale, getTranslations } from 'next-intl/server';
import { z } from 'zod';
import type { QrSheetLabels } from '@/components/invoices/QrSheet';
import type { OwedBill } from '@/server/collections/load';
import { createSessionClient } from '@/server/supabase/server';

/** The household's default receiving account with the bank's name as payers know it. */
export type ReceivingAccountView = ReceivingAccount & { readonly id: string; readonly bankName: string };

/** The code for what is still owed with what the payer's bank app will show, ready for the page's language. */
export type PayableQr = {
  readonly payload: string;
  readonly amountText: string;
  /** At or above the NAPAS 247 cap the code carries no amount, so the amount in words and the split note stand in. */
  readonly amountWords: string | null;
  readonly memo: string;
  readonly bankName: string;
  readonly accountNo: string;
  readonly accountName: string;
};

/** What the QR sheet and the bill show and the saved picture prints. */
export type InvoiceQrView = PayableQr & { readonly number: string };

const accountSchema = z
  .object({ id: z.uuid(), bank_bin: z.string(), account_no: z.string(), account_name: z.string(), bank: z.object({ short_name: z.string().nullable(), name: z.string() }) })
  .transform((row): ReceivingAccountView => ({ id: row.id, bin: row.bank_bin, accountNo: row.account_no, accountName: row.account_name, bankName: row.bank.short_name ?? row.bank.name }));

export async function loadReceivingAccount(householdId: string): Promise<ReceivingAccountView | null> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase
    .from('bank_accounts')
    .select('id, bank_bin, account_no, account_name, bank:bank_bins(short_name, name)')
    .eq('household_id', householdId)
    .eq('is_default', true)
    .maybeSingle();
  if (error) throw new Error(`Reading the receiving account failed: ${error.message}`);
  return data === null ? null : accountSchema.parse(data);
}

type QrSource = { readonly status: 'draft' | 'issued' | 'void'; readonly number: string; readonly memoCode: string; readonly outstandingVnd: Vnd };

type PayeeAccount = Pick<ReceivingAccountView, 'bin' | 'accountNo' | 'accountName' | 'bankName'>;

/** The code for `outstandingVnd` into `account`, or null when nothing is owed. */
export function payableQr(account: PayeeAccount, outstandingVnd: Vnd, memoCode: string, locale: Locale): PayableQr | null {
  if (outstandingVnd <= 0) return null;
  const qr = buildInvoiceQr({ account, outstandingVnd, memoCode });
  return {
    payload: qr.payload,
    amountText: formatVnd(outstandingVnd, locale),
    amountWords: qr.amountInQr ? null : vndInWords(outstandingVnd, locale),
    memo: invoiceMemo(memoCode),
    bankName: account.bankName,
    accountNo: account.accountNo,
    accountName: account.accountName,
  };
}

/** LSE-5: only an issued bill with something still owed shows a code, for the outstanding amount and its memo. */
export function invoiceQrView(invoice: QrSource, account: ReceivingAccountView | null, locale: Locale): InvoiceQrView | null {
  if (invoice.status !== 'issued' || account === null) return null;
  const qr = payableQr(account, invoice.outstandingVnd, invoice.memoCode, locale);
  return qr === null ? null : { ...qr, number: invoice.number };
}

type BoardRow = { readonly invoiceId: string; readonly number: string; readonly outstandingVnd: Vnd };

/** The `Mã QR` of every board row still owed, keyed by invoice. The board lists issued bills only (LSE-10). */
export function boardQrs(rows: readonly BoardRow[], owed: ReadonlyMap<string, OwedBill>, account: ReceivingAccountView | null, locale: Locale): Map<string, InvoiceQrView> {
  return new Map(
    rows.flatMap((row) => {
      const bill = owed.get(row.invoiceId);
      const view = bill === undefined ? null : invoiceQrView({ status: 'issued', number: row.number, memoCode: bill.memoCode, outstandingVnd: row.outstandingVnd }, account, locale);
      return view === null ? [] : [[row.invoiceId, view] as const];
    }),
  );
}

/** The QR sheet's and the bill's words, translated on the server and handed to the client sheet as props. */
export async function loadQrLabels(): Promise<QrSheetLabels> {
  const [t, locale] = await Promise.all([getTranslations('invoices'), getLocale()]);
  return {
    code: t('qrCode'),
    amount: t('qrAmount'),
    amountWords: t('qrAmountWords'),
    memo: t('qrMemo'),
    bank: t('qrBank'),
    accountNo: t('qrAccountNo'),
    accountName: t('qrAccountName'),
    assumption: t('qrAssumption'),
    splitNote: t('qrSplitNote', { cap: formatVnd(VIETQR_RULES.singleTransferCapVnd, locale) }),
    save: t('qrSave'),
    saveFailed: t('qrSaveFailed'),
    close: t('qrClose'),
    openInvoice: t('openInvoice'),
  };
}
