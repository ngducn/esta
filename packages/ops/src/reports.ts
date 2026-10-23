import type { IsoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { inEffect } from '@esta/core/lease';
import type { ReportLease, ReportSnapshot } from '@esta/core/reports';
import type { Db } from './db';
import { readInvoices } from './invoices';
import { readLeaseNames, readLeases, readLeaseSchedule, scheduleUntil, withTenants } from './leases';
import { readLedgerFacts } from './ledger';

/** Everything the household's reports read for `from` to `to` and the Clock's date `asOf`; RLS scopes it to the member. */
export async function readReportSnapshot(db: Db, householdId: string, { from, to, asOf }: { from: IsoDate; to: IsoDate; asOf: IsoDate }): Promise<ReportSnapshot> {
  const [properties, facts, invoices, leases] = await Promise.all([
    db.from('properties').select('id, name:nickname').eq('household_id', householdId).is('deleted_at', null).order('nickname').order('id'),
    readLedgerFacts(db, householdId, { from, to }),
    readInvoices(db, householdId, { issuedDueFrom: from, issuedDueTo: to }),
    readLeases(db, householdId),
  ]);
  if (properties.error) throw new Error(`Reading the properties failed: ${properties.error.message}`);
  const live = new Set(properties.data.map((property) => property.id));
  const liveLeases = leases.filter((lease) => live.has(lease.property_id));
  const liveLeaseIds = new Set(liveLeases.map((lease) => lease.id));
  const rolled = liveLeases.filter((lease) => inEffect(lease, asOf));
  const ids = rolled.map((lease) => lease.id);
  const [tenanted, names, leaseInvoices, schedule] = await Promise.all([
    withTenants(db, householdId, rolled),
    readLeaseNames(db, householdId, rolled),
    readInvoices(db, householdId, { leaseIds: ids }),
    readLeaseSchedule(db, ids, scheduleUntil(rolled, asOf)),
  ]);
  return {
    from,
    to,
    asOf,
    properties: properties.data,
    incomes: facts.incomes.filter((fact) => live.has(fact.propertyId)),
    expenses: facts.expenses.filter((fact) => live.has(fact.propertyId)),
    invoices: invoices.filter((invoice) => liveLeaseIds.has(invoice.leaseId)),
    leases: tenanted.map(
      (lease): ReportLease => ({
        ...lease,
        propertyName: names.properties.get(lease.property_id) ?? '',
        unitLabel: names.units.get(lease.unit_id)?.label ?? '',
        wholeUnit: names.units.get(lease.unit_id)?.whole ?? false,
        tenantName: lease.tenant?.fullName ?? null,
        depositHeldVnd: vnd(names.held.get(lease.id) ?? 0),
      }),
    ),
    leaseInvoices,
    schedule,
  };
}
