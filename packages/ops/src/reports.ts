import type { IsoDate } from '@esta/core/date';
import { inEffect } from '@esta/core/lease';
import { vnd } from '@esta/core/money';
import type { ReportLease, ReportSnapshot, ReportUnit } from '@esta/core/reports';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { z } from 'zod';
import type { Db } from './db';
import { readInvoices } from './invoices';
import { readAll } from './kit';
import { readLeaseNames, readLeases, readLeaseSchedule, scheduleUntil, withTenants } from './leases';
import { readLedgerFacts } from './ledger';
import { readOtherBusinessRevenues, readOwners, readTaxRows } from './tax';
import { readValuations } from './valuations';

const unitRowSchema = z
  .object({ id: z.uuid(), property_id: z.uuid(), label: z.string(), kind: z.string(), available_from: isoDateSchema.nullable(), property: z.object({ nickname: z.string() }) })
  .transform(
    (row): ReportUnit => ({ id: row.id, propertyId: row.property_id, propertyName: row.property.nickname, label: row.label, wholeUnit: row.kind === 'whole', availableFrom: row.available_from }),
  );

/** The units of the household's live properties let as rentals (AGENT.md §5.3 W4). */
async function readRentalUnits(db: Db, householdId: string): Promise<ReportUnit[]> {
  const rows = await readAll('rental units', (from, to) =>
    db
      .from('units')
      .select('id, property_id, label, kind, available_from, property:properties!inner(nickname)')
      .eq('household_id', householdId)
      .is('property.deleted_at', null)
      .eq('property.use_mode', 'rental')
      .order('id')
      .range(from, to),
  );
  return z.array(unitRowSchema).parse(rows);
}

/** Everything the household's reports read for `from` to `to`, its year's tax, and the Clock's date `asOf`; RLS scopes it to the member. */
export async function readReportSnapshot(db: Db, householdId: string, { from, to, asOf }: { from: IsoDate; to: IsoDate; asOf: IsoDate }): Promise<ReportSnapshot> {
  const year = Number(from.slice(0, 4));
  const [properties, facts, invoices, leases, units, valuations, tax, otherRevenue] = await Promise.all([
    db.from('properties').select('id, name:nickname').eq('household_id', householdId).is('deleted_at', null).order('nickname').order('id'),
    readLedgerFacts(db, householdId, { from, to }),
    readInvoices(db, householdId, { issuedDueFrom: from, issuedDueTo: to }),
    readLeases(db, householdId),
    readRentalUnits(db, householdId),
    readValuations(db, householdId),
    readTaxRows(db, householdId, year),
    readOtherBusinessRevenues(db, householdId, year),
  ]);
  if (properties.error) throw new Error(`Reading the properties failed: ${properties.error.message}`);
  const live = new Set(properties.data.map((property) => property.id));
  const liveLeases = leases.filter((lease) => live.has(lease.property_id));
  const liveLeaseIds = new Set(liveLeases.map((lease) => lease.id));
  const rolled = liveLeases.filter((lease) => inEffect(lease, asOf));
  const ids = rolled.map((lease) => lease.id);
  const [tenanted, names, leaseInvoices, schedule, owners] = await Promise.all([
    withTenants(db, householdId, rolled),
    readLeaseNames(db, householdId, rolled),
    readInvoices(db, householdId, { leaseIds: ids }),
    readLeaseSchedule(db, ids, scheduleUntil(rolled, asOf)),
    readOwners(db, householdId, [...new Set(tax.shares.map((share) => share.partyId))]),
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
    units,
    tenancies: liveLeases.flatMap(({ unit_id, status, start_date, end_date }) => (status === 'draft' ? [] : [{ unitId: unit_id, status, start_date, end_date }])),
    valuations,
    owners: owners.map((owner) => ({ id: owner.id, name: owner.name, otherBusinessRevenueVnd: otherRevenue.get(owner.id) ?? vnd(0) })),
    tax,
  };
}
