import type { IsoDate } from '@esta/core/date';
import { daysBetween } from '@esta/core/date/calendar';
import { formatCount, formatDate } from '@esta/core/format';
import { LEASE_STATUSES } from '@esta/core/lease';
import { estaUri } from '@esta/core/links';
import { paymentBehavior } from '@esta/core/reports';
import { z } from 'zod';
import type { ReadToolContext } from './ask-reads';
import { sameAnswer } from './fact-sheet';
import { propertyByHandle } from './list-properties';
import { parseToolInput } from './server';

const leasesInput = z.strictObject({
  status: z.enum(LEASE_STATUSES).optional(),
  ends_within_days: z.number().int().min(0).max(3660).optional(),
  property: z.string().optional(),
});
const LEASES_USAGE = 'list_leases takes {"status": draft, active, ended or terminated, "ends_within_days": leases ending from today to that many days ahead, "property": a handle from list_properties}, each optional';

/** `list_leases` (AGENT.md §4): the household's leases, the soonest end first, each with what it rents and to whom. */
export function listLeasesTool({ reads, locale, asOf, cite, properties }: ReadToolContext) {
  return sameAnswer(async (raw: Record<string, unknown>) => {
    const { status, ends_within_days: within, property } = parseToolInput(leasesInput, raw, LEASES_USAGE);
    const scope = property === undefined ? null : propertyByHandle(properties, property);
    const left = (end: IsoDate | null) => (end === null ? null : daysBetween(asOf, end));
    const leases = (await reads.leases()).filter((lease) => {
      const days = left(lease.end_date);
      return (status === undefined || lease.status === status) && (scope === null || lease.property_id === scope.id) && (within === undefined || (days !== null && days >= 0 && days <= within));
    });
    return {
      leases: leases
        .toSorted((a, b) => (a.end_date ?? '9999').localeCompare(b.end_date ?? '9999'))
        .map((lease) => {
          const days = left(lease.end_date);
          return cite({
            property_label: lease.property,
            unit_label: lease.unit,
            tenant_name: lease.tenant?.full_name ?? null,
            status: lease.status,
            rent_display: lease.rent_display,
            deposit_held_display: lease.held_deposit_display,
            start_date_display: lease.start_date === null ? null : formatDate(lease.start_date, locale),
            end_date_display: lease.end_date === null ? null : formatDate(lease.end_date, locale),
            days_until_end_display: days === null || days < 0 ? null : formatCount(days, locale),
            link: estaUri({ type: 'lease', id: lease.id }),
          });
        }),
    };
  });
}

const behaviorInput = z.strictObject({ year: z.number().int().min(2000).max(2100) });

/** `payment_behavior` (AGENT.md §4): per tenant, the year's bills due by today and how many were paid late, the most often late first. */
export function paymentBehaviorTool({ reads, locale, asOf, cite }: ReadToolContext) {
  return sameAnswer(async (raw: Record<string, unknown>) => {
    const { year } = parseToolInput(behaviorInput, raw, 'payment_behavior takes {"year"}');
    const [report, leases] = await Promise.all([reads.report(year), reads.leases()]);
    const payments = await reads.payments(report.invoices.map((invoice) => invoice.id));
    const tenants = new Map(leases.flatMap((lease) => (lease.tenant === null ? [] : [[lease.id, lease.tenant] as const])));
    const tenantOf = new Map([...tenants].map(([leaseId, tenant]) => [leaseId, tenant.id]));
    const names = new Map([...tenants.values()].map((tenant) => [tenant.id, tenant.full_name]));
    return {
      tenants: paymentBehavior(report.invoices, payments, tenantOf, asOf).map((row) =>
        cite({
          tenant_name: names.get(row.tenantId) ?? null,
          invoice_count_display: formatCount(row.invoiceCount, locale),
          paid_late_count_display: formatCount(row.paidLateCount, locale),
          average_days_late_display: row.averageDaysLate === null ? null : formatCount(row.averageDaysLate, locale),
          overdue_count_display: formatCount(row.overdueCount, locale),
          link: estaUri({ type: 'party', id: row.tenantId }),
        }),
      ),
    };
  });
}
