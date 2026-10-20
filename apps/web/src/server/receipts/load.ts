import 'server-only';
import type { IsoDate } from '@esta/core/date';
import { buildReceiptModel } from '@esta/core/receipt';
import { getTranslations } from 'next-intl/server';
import { z } from 'zod';
import { loadInvoice } from '@/server/invoices/load';
import { invoiceQrView, loadReceivingAccount } from '@/server/invoices/qr';
import type { Member } from '@/server/member';
import { createSessionClient } from '@/server/supabase/server';
import type { Receipt, ReceiptLabels } from './kit';

const invoicingSchema = z.object({ receipt_header: z.string().trim().min(1).optional().catch(undefined) });

/** SPEC §5: the receipt header text from `household_settings.invoicing`, else the household's own name. */
async function receiptHeader(member: Member): Promise<string> {
  const supabase = await createSessionClient();
  const { data, error } = await supabase.from('household_settings').select('invoicing').eq('household_id', member.household.id).maybeSingle();
  if (error) throw new Error(`Reading the receipt header failed: ${error.message}`);
  const parsed = invoicingSchema.safeParse(data?.invoicing ?? {});
  return (parsed.success ? parsed.data.receipt_header : undefined) ?? member.household.name;
}

type ReceiptT = Awaited<ReturnType<typeof getTranslations<'receipt'>>>;

function receiptLabels(t: ReceiptT): ReceiptLabels {
  return {
    number: t('number'),
    issuedOn: t('issuedOn'),
    tenant: t('tenant'),
    place: t('place'),
    period: t('period'),
    lines: t('lines'),
    total: t('total'),
    words: t('words'),
    received: t('received'),
    outstanding: t('outstanding'),
    paidInFull: t('paidInFull'),
    scanToPay: t('scanToPay'),
    memo: t('memo'),
    account: t('account'),
  };
}

/**
 * LSE-6: an issued bill as its receipt, read under RLS, so another household's bill, a draft or a voided one is null.
 * The receipt is Vietnamese whatever the screen's language, because the tenant reads it.
 */
export async function loadReceipt(member: Member, invoiceId: string, today: IsoDate): Promise<Receipt | null> {
  const invoice = await loadInvoice(member.household.id, invoiceId);
  if (invoice === null || invoice.status !== 'issued') return null;
  const [header, t, account, bill, collections] = await Promise.all([
    receiptHeader(member),
    getTranslations({ locale: 'vi', namespace: 'receipt' }),
    invoice.outstandingVnd > 0 ? loadReceivingAccount(member.household.id) : null,
    getTranslations({ locale: 'vi', namespace: 'invoices' }),
    getTranslations({ locale: 'vi', namespace: 'collections' }),
  ]);
  const qr = invoiceQrView(invoice, account, 'vi');
  return buildReceiptModel({
    header,
    number: invoice.number,
    issuedOn: today,
    tenant: invoice.tenantName ?? t('noTenant'),
    place: invoice.wholeUnit ? invoice.propertyName : collections('place', { unit: invoice.unitLabel, property: invoice.propertyName }),
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    lines: invoice.lines.map((line) => ({ label: line.description ?? bill('lineKind', { kind: line.kind }), amountVnd: line.amountVnd })),
    totalVnd: invoice.totalVnd,
    receivedVnd: invoice.allocatedVnd,
    outstandingVnd: invoice.outstandingVnd,
    qr: qr === null ? null : { payload: qr.payload, memo: qr.memo, bank: qr.bankName, accountNo: qr.accountNo, accountName: qr.accountName },
    titles: { notice: t('title', { kind: 'notice' }), receipt: t('title', { kind: 'receipt' }) },
    labels: receiptLabels(t),
  });
}
