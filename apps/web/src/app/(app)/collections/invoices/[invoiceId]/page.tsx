import type { Locale } from '@esta/core/format';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { AddReceivingAccount } from '@/components/invoices/AddReceivingAccount';
import { InvoiceActions } from '@/components/invoices/InvoiceActions';
import { InvoiceView, type QrState } from '@/components/invoices/InvoiceView';
import { PrintButton } from '@/components/invoices/PrintButton';
import { ReceiptLinks } from '@/components/invoices/ReceiptLinks';
import { BackLink } from '@/components/properties/back-link';
import { buttonVariants } from '@/components/ui/button-variants';
import { IntentLink } from '@/components/shell/intent-link';
import { qrMatrix } from '@/lib/qr';
import { getClock } from '@/server/clock';
import { loadInvoice, type InvoiceDetail } from '@/server/invoices/load';
import { loadAccountSheet, loadInvoiceActionLabels } from '@/server/invoices/labels';
import { invoiceQrView, loadQrLabels, loadReceivingAccount } from '@/server/invoices/qr';
import { requireMember, type Member } from '@/server/member';
import './print.css';

const paramsSchema = z.object({ invoiceId: z.uuid() });
type Params = Promise<{ invoiceId: string }>;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('invoices');
  return { title: t('metaTitle') };
}

async function qrState(invoice: InvoiceDetail, householdId: string, locale: Locale): Promise<QrState> {
  if (invoice.status !== 'issued') return { kind: invoice.status };
  if (invoice.outstandingVnd <= 0) return { kind: 'paid' };
  const [account, labels] = await Promise.all([loadReceivingAccount(householdId), loadQrLabels()]);
  const qr = invoiceQrView(invoice, account, locale);
  return qr === null ? { kind: 'noAccount' } : { kind: 'shown', qr, matrix: qrMatrix(qr.payload), labels };
}

/** Adding the account is an admin's call; anyone else is told to ask one. */
async function noAccountAction(role: Member['role']) {
  const t = await getTranslations('invoices');
  if (role !== 'admin') return <p className="text-body text-ink-2">{t('noAccountAsk')}</p>;
  const { banks, labels } = await loadAccountSheet();
  return <AddReceivingAccount label={t('addAccount')} banks={banks} labels={labels} />;
}

/** Issuing a draft, voiding an unpaid issued bill, or why a paid one cannot be voided ([app rule]). */
async function billActions(invoice: InvoiceDetail) {
  if (invoice.status === 'void') return null;
  const t = await getTranslations('invoices');
  if (invoice.status === 'issued' && invoice.allocatedVnd > 0) {
    return (
      <p data-testid="invoice-void-paid" className="text-body text-ink-2">
        {t('voidPaidNote')}
      </p>
    );
  }
  return <InvoiceActions invoiceId={invoice.id} status={invoice.status} labels={await loadInvoiceActionLabels(invoice.number)} />;
}

/** LSE-5: one bill, reached from the board's QR sheet or the lease's timeline. A bill of another household is not found. */
export default async function InvoicePage({ params }: { params: Params }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const [member, clock, locale, t, collections] = await Promise.all([requireMember(), getClock(), getLocale(), getTranslations('invoices'), getTranslations('collections')]);
  const invoice = await loadInvoice(member.household.id, parsed.data.invoiceId);
  if (invoice === null) notFound();
  const place = invoice.wholeUnit ? invoice.propertyName : collections('place', { unit: invoice.unitLabel, property: invoice.propertyName });
  const canEdit = member.role !== 'viewer';
  const qr = await qrState(invoice, member.household.id, locale);
  const [actions, accountAction] = await Promise.all([canEdit ? billActions(invoice) : null, qr.kind === 'noAccount' ? noAccountAction(member.role) : null]);
  // A draft's `Phát hành` sits under the sentence saying when it would issue, where Mẹ reads it on a phone.
  const issuing = invoice.status === 'draft';
  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <BackLink href="/collections" label={t('back')} />
      </div>
      <InvoiceView invoice={invoice} qr={qr} place={place} asOf={clock.today()} locale={locale} noQrAction={issuing ? actions : accountAction} />
      <div className="flex flex-wrap items-start gap-3 print:hidden">
        {issuing ? null : actions}
        <PrintButton label={t('print')} />
        {invoice.status === 'issued' ? <ReceiptLinks invoiceId={invoice.id} labels={{ pdf: t('receiptPdf'), png: t('receiptPng') }} /> : null}
        <IntentLink href={`/properties/${invoice.propertyId}/rental/leases/${invoice.leaseId}`} className={buttonVariants({ variant: 'outline' })}>
          {t('openLease')}
        </IntentLink>
      </div>
    </div>
  );
}
