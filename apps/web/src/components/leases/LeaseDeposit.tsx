import { deriveDepositLedger, openInvoicesOldestFirst } from '@esta/core/allocation';
import type { IsoDate } from '@esta/core/date';
import { getLocale, getMessages } from 'next-intl/server';
import { PropertyIntl } from '@/components/properties/property-intl';
import { loadDepositLines } from '@/server/leases/deposits';
import type { InvoiceSummary, LeaseWithTenant } from '@/server/leases/load';
import { DepositLedger, type DepositOffer } from './DepositLedger';

/**
 * LSE-9 on lease detail: loads the lease's deposit entries, derives the ledger the database holds the same rule for
 * (deposit_ledger_parity.test.sql), and offers a member the issued invoices a deposit may still pay, oldest due first.
 */
export async function LeaseDeposit({
  lease,
  unitLabel,
  invoices,
  canEdit,
  today,
}: {
  lease: LeaseWithTenant;
  unitLabel: string;
  invoices: readonly InvoiceSummary[];
  canEdit: boolean;
  today: IsoDate;
}) {
  const [lines, locale, messages] = await Promise.all([loadDepositLines(lease.id), getLocale(), getMessages()]);
  const ledger = deriveDepositLedger(lines);
  if (!ledger.ok) throw new Error(`Deposit ledger of lease ${lease.id} refused at entry ${ledger.entryId}: ${ledger.reason}`);
  const offer: DepositOffer | null = canEdit
    ? {
        leaseId: lease.id,
        unitLabel,
        today,
        active: lease.status === 'active',
        openInvoices: openInvoicesOldestFirst(invoices).map(({ id, dueDate, periodStart, periodEnd, outstandingVnd }) => ({
          id,
          dueDate,
          periodStart,
          periodEnd,
          outstandingVnd,
        })),
      }
    : null;
  const { money, date, status, toast } = messages.components;
  return (
    <PropertyIntl locale={locale} messages={{ deposits: messages.deposits, components: { money, date, status, toast } }}>
      <DepositLedger rows={ledger.value.rows} held={ledger.value.heldVnd} contractVnd={lease.deposit_vnd} offer={offer} />
    </PropertyIntl>
  );
}
