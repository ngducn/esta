import type { Locale } from '@esta/core/format';
import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { InvoiceView, type QrState } from '@/components/invoices/InvoiceView';
import { PrintButton } from '@/components/invoices/PrintButton';
import { BackLink } from '@/components/properties/back-link';
import { buttonVariants } from '@/components/ui/button-variants';
import { IntentLink } from '@/components/shell/intent-link';
import { qrMatrix } from '@/lib/qr';
import { getClock } from '@/server/clock';
import { loadInvoice, type InvoiceDetail } from '@/server/invoices/load';
import { invoiceQrView, loadQrLabels, loadReceivingAccount } from '@/server/invoices/qr';
import { requireMember } from '@/server/member';
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

/** LSE-5: one bill, reached from the board's QR sheet or the lease's timeline. A bill of another household is not found. */
export default async function InvoicePage({ params }: { params: Params }) {
  const parsed = paramsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const [member, clock, locale, t, collections] = await Promise.all([requireMember(), getClock(), getLocale(), getTranslations('invoices'), getTranslations('collections')]);
  const invoice = await loadInvoice(member.household.id, parsed.data.invoiceId);
  if (invoice === null) notFound();
  const place = invoice.wholeUnit ? invoice.propertyName : collections('place', { unit: invoice.unitLabel, property: invoice.propertyName });
  const qr = await qrState(invoice, member.household.id, locale);
  return (
    <div className="flex flex-col gap-5">
      <div className="print:hidden">
        <BackLink href="/collections" label={t('back')} />
      </div>
      <InvoiceView invoice={invoice} qr={qr} place={place} asOf={clock.today()} locale={locale} />
      <div className="flex flex-wrap gap-3 print:hidden">
        <PrintButton label={t('print')} />
        <IntentLink href={`/properties/${invoice.propertyId}/rental/leases/${invoice.leaseId}`} className={buttonVariants({ variant: 'outline' })}>
          {t('openLease')}
        </IntentLink>
      </div>
    </div>
  );
}
