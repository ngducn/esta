import { deriveDepositLedger, DEPOSIT_KINDS } from '@esta/core/allocation';
import { businessDate, parseInstant } from '@esta/core';
import type { IsoDate } from '@esta/core/date';
import { addMonths, firstOfMonth } from '@esta/core/date/calendar';
import { vnd, type Vnd } from '@esta/core/money';
import { isoDateSchema } from '@esta/core/schemas/legal';
import { computeTaxPosition, toTaxInputs } from '@esta/core/tax';
import { watchSnapshotSchema, type WatchSnapshot } from '@esta/core/watch';
import { z } from 'zod';
import { readCompleteness } from './completeness';
import type { Db } from './db';
import { readInvoices } from './invoices';
import { readAll, readRows } from './kit';
import { readLeases } from './leases';
import { readOtherBusinessRevenues, readTaxOwners, readTaxRows } from './tax';

const depositEntrySchema = z
  .object({ id: z.uuid(), lease_id: z.uuid(), kind: z.enum(DEPOSIT_KINDS), amount_vnd: z.number().int().transform(vnd), on_date: isoDateSchema })
  .transform((row) => ({ id: row.id, leaseId: row.lease_id, kind: row.kind, amountVnd: row.amount_vnd, onDate: row.on_date }));

/** Each lease's deposit held on `asOf`, from the entries dated by then. */
async function readHeldDeposits(db: Db, householdId: string, asOf: IsoDate): Promise<Map<string, Vnd>> {
  const entries = z.array(depositEntrySchema).parse(
    await readAll('deposit entries', (from, to) =>
      db.from('deposit_entries').select('id, lease_id, kind, amount_vnd, on_date').eq('household_id', householdId).lte('on_date', asOf).order('id').range(from, to),
    ),
  );
  const byLease = new Map<string, (typeof entries)[number][]>();
  for (const entry of entries) byLease.set(entry.leaseId, [...(byLease.get(entry.leaseId) ?? []), entry]);
  const held = new Map<string, Vnd>();
  for (const [leaseId, own] of byLease) {
    const ledger = deriveDepositLedger(own);
    if (!ledger.ok) throw new Error(`The deposit of lease ${leaseId} does not add up: ${ledger.reason}`);
    held.set(leaseId, ledger.value.heldVnd);
  }
  return held;
}

/** Each owner's FIN-3 position for the year of `asOf`, as the tax card computes it; an owner with no rule for the year has none. */
async function readTaxPositions(db: Db, householdId: string, asOf: IsoDate) {
  const year = Number(asOf.slice(0, 4));
  const [tax, otherRevenue] = await Promise.all([readTaxRows(db, householdId, year), readOtherBusinessRevenues(db, householdId, year)]);
  const owners = await readTaxOwners(db, householdId, tax);
  return owners.flatMap((owner) => {
    const inputs = toTaxInputs({ ...tax, otherBusinessRevenueVnd: otherRevenue.get(owner.id) ?? vnd(0) }, { partyId: owner.id, year, asOf });
    if (inputs.kind === 'no_rule') return [];
    const { projectedVnd, thresholdTotalVnd, thresholdVnd, progressBp } = computeTaxPosition(inputs);
    return [{ partyId: owner.id, year, projectedVnd, thresholdTotalVnd, thresholdVnd, progressBp }];
  });
}

/** Documents whose latest reading waits for review, dated by the business day the extraction was created. */
async function readWaitingExtractions(db: Db, householdId: string, timezone: string) {
  const waiting = await readRows('waiting reviews', db.from('document_status').select('document_id, extraction_id').eq('household_id', householdId).eq('status', 'needs_review'));
  const documentIds = waiting.flatMap((row) => (row.document_id === null ? [] : [row.document_id]));
  const extractionIds = waiting.flatMap((row) => (row.extraction_id === null ? [] : [row.extraction_id]));
  if (documentIds.length === 0) return [];
  const [documents, extractions] = await Promise.all([
    readRows('waiting documents', db.from('documents').select('id, property_id').eq('household_id', householdId).is('deleted_at', null).in('id', documentIds)),
    readRows('waiting extractions', db.from('document_extractions').select('id, document_id, created_at').eq('household_id', householdId).in('id', extractionIds)),
  ]);
  const live = new Map(documents.map((document) => [document.id, document.property_id]));
  return extractions.flatMap((extraction) => {
    const propertyId = live.get(extraction.document_id);
    return propertyId === undefined ? [] : [{ documentId: extraction.document_id, propertyId, waitingSince: businessDate(parseInstant(extraction.created_at), timezone) }];
  });
}

/** The latest reading of each active meter on or before `asOf`, looking back to the start of the previous month. */
async function readMeters(db: Db, householdId: string, asOf: IsoDate) {
  const [meters, readings] = await Promise.all([
    readAll('meters', (from, to) => db.from('meters').select('id, unit_id').eq('household_id', householdId).eq('active', true).order('id').range(from, to)),
    readAll('meter readings', (from, to) =>
      db.from('meter_readings').select('id, meter_id, read_on').eq('household_id', householdId).gte('read_on', addMonths(firstOfMonth(asOf), -1)).lte('read_on', asOf).order('id').range(from, to),
    ),
  ]);
  const last = new Map<string, string>();
  for (const reading of readings) if ((last.get(reading.meter_id) ?? '') < reading.read_on) last.set(reading.meter_id, reading.read_on);
  return meters.map((meter) => ({ id: meter.id, unitId: meter.unit_id, lastReadOn: last.get(meter.id) ?? null }));
}

/**
 * One household as the watch rules (AGENT.md §5.3) read it on `asOf`. Every date window is anchored on `asOf`, never on
 * the database's clock. Pass a member's session: the service role cannot run `private.payment_status` behind
 * `invoice_balances`, and `lease_schedule` returns no periods to it, so its tax positions would read zero.
 */
export async function readWatchSnapshot(db: Db, householdId: string, { asOf, timezone }: { asOf: IsoDate; timezone: string }): Promise<WatchSnapshot> {
  const [properties, completeness, units, leases, held, invoices, documents, meters, taxPositions, extractions] = await Promise.all([
    readAll('properties', (from, to) => db.from('properties').select('id, kind, use_mode, deleted_at').eq('household_id', householdId).order('id').range(from, to)),
    readCompleteness(db, householdId),
    readAll('units', (from, to) => db.from('units').select('id, property_id, available_from').eq('household_id', householdId).order('id').range(from, to)),
    readLeases(db, householdId),
    readHeldDeposits(db, householdId, asOf),
    readInvoices(db, householdId, { issuedOnOrBefore: asOf }),
    readAll('expiring documents', (from, to) =>
      db.from('documents').select('id, property_id, expires_on').eq('household_id', householdId).is('deleted_at', null).gte('expires_on', asOf).order('id').range(from, to),
    ),
    readMeters(db, householdId, asOf),
    readTaxPositions(db, householdId, asOf),
    readWaitingExtractions(db, householdId, timezone),
  ]);
  const signed = leases.filter((lease) => lease.status !== 'draft');
  const renewed = new Set(signed.flatMap((lease) => (lease.renewal_of_lease_id === null ? [] : [lease.renewal_of_lease_id])));
  return watchSnapshotSchema.parse({
    householdId,
    asOf,
    properties: properties.map((property) => ({
      id: property.id,
      kind: property.kind,
      useMode: property.use_mode,
      archived: property.deleted_at !== null,
      completenessPercent: completeness.get(property.id)?.percent ?? null,
    })),
    units: units.map((unit) => ({ id: unit.id, propertyId: unit.property_id, availableFrom: unit.available_from })),
    leases: signed.map((lease) => ({
      id: lease.id,
      unitId: lease.unit_id,
      propertyId: lease.property_id,
      tenantId: lease.tenant_party_id,
      status: lease.status,
      start_date: lease.start_date,
      end_date: lease.end_date,
      renewed: renewed.has(lease.id),
      depositHeldVnd: held.get(lease.id) ?? 0,
    })),
    invoices: invoices.map(({ id, leaseId, dueDate, totalVnd, allocatedVnd, outstandingVnd, paymentStatus }) => ({ id, leaseId, dueDate, totalVnd, allocatedVnd, outstandingVnd, paymentStatus })),
    documents: documents.map((document) => ({ id: document.id, propertyId: document.property_id, expiresOn: document.expires_on })),
    meters,
    taxPositions,
    extractions,
  });
}
