import { isoDate, type IsoDate } from '@esta/core/date';
import { vnd, type Vnd } from '@esta/core/money';
import { ownershipShareRowSchema, TAX_LEASE_COLUMNS, taxLeaseRowSchema, taxRuleRowSchema, toTaxInputs, type TaxInputs, type TaxRows } from '@esta/core/tax';
import { z } from 'zod';
import type { Db } from './db';
import { readRows } from './kit';
import { readLeaseSchedule } from './leases';

const TAX_RULE_COLUMNS = 'kind, effective_from, effective_to, params, source_citation, note';

/** Each party's other business revenue saved for the year; a party with no row is absent. */
export async function readOtherBusinessRevenues(db: Db, householdId: string, year: number): Promise<Map<string, Vnd>> {
  const saved = await readRows('other business revenue', db.from('owner_tax_inputs').select('party_id, other_business_revenue_vnd').eq('household_id', householdId).eq('year', year));
  return new Map(saved.map((row) => [row.party_id, vnd(z.number().int().nonnegative().parse(row.other_business_revenue_vnd))]));
}

/** The other business revenue saved for an owner and year; no row reads as 0. */
export async function readOtherBusinessRevenue(db: Db, householdId: string, { partyId, year }: { partyId: string; year: number }) {
  const saved = await readRows(
    'other business revenue',
    db.from('owner_tax_inputs').select('other_business_revenue_vnd').eq('household_id', householdId).eq('party_id', partyId).eq('year', year),
  );
  return vnd(z.number().int().nonnegative().parse(saved[0]?.other_business_revenue_vnd ?? 0));
}

export type Owner = { readonly id: string; readonly name: string; readonly memberId: string | null };

const ownerSchema = z.object({ id: z.uuid(), full_name: z.string(), member_id: z.uuid().nullable() }).transform((row): Owner => ({ id: row.id, name: row.full_name, memberId: row.member_id }));

/** The household's parties tagged owner, and the parties `alsoIds` names, by name. */
export async function readOwners(db: Db, householdId: string, alsoIds: readonly string[] = []): Promise<Owner[]> {
  const query = db.from('parties').select('id, full_name, member_id').eq('household_id', householdId);
  const read = await readRows('owners', (alsoIds.length === 0 ? query.contains('tags', ['owner']) : query.or(`tags.cs.{owner},id.in.(${alsoIds.join(',')})`)).order('full_name').order('id'));
  return z.array(ownerSchema).parse(read);
}

/** The owner parties and anyone else a year's tax rows attribute revenue to: a shareholder or a lease's declaring party. */
export function readTaxOwners(db: Db, householdId: string, tax: Pick<TaxRows, 'shares' | 'leases'>): Promise<Owner[]> {
  return readOwners(db, householdId, [...new Set([...tax.shares.map((share) => share.partyId), ...tax.leases.flatMap((lease) => lease.declaringPartyId ?? [])])]);
}

/**
 * The household's FIN-3 rows for a year: its non-draft leases with their periods through 31 December, ownership shares
 * and the tax rules. Leases of archived properties stay, because the revenue they earned that year counts.
 */
export async function readTaxRows(db: Db, householdId: string, year: number): Promise<Omit<TaxRows, 'otherBusinessRevenueVnd'>> {
  const yearEnd = isoDate(`${year}-12-31`);
  const [leases, shares, rules] = await Promise.all([
    readRows('tax leases', db.from('leases').select(TAX_LEASE_COLUMNS).eq('household_id', householdId).neq('status', 'draft').lte('start_date', yearEnd).order('id')),
    readRows('ownership shares', db.from('ownership_shares').select('property_id, party_id, share_bp').eq('household_id', householdId).order('id')),
    readRows('tax rules', db.from('tax_rules').select(TAX_RULE_COLUMNS)),
  ]);
  const taxLeases = z.array(taxLeaseRowSchema).parse(leases);
  const schedule = await readLeaseSchedule(
    db,
    taxLeases.map((lease) => lease.id),
    yearEnd,
  );
  return { leases: taxLeases, schedule, shares: z.array(ownershipShareRowSchema).parse(shares), rules: z.array(taxRuleRowSchema).parse(rules) };
}

/** One owner's FIN-3 inputs for a year from the household's tax rows and the owner's other business revenue, mapped by core's `toTaxInputs`. */
export async function readTaxInputs(db: Db, householdId: string, at: { partyId: string; year: number; asOf: IsoDate }): Promise<TaxInputs> {
  const [taxRows, otherBusinessRevenueVnd] = await Promise.all([readTaxRows(db, householdId, at.year), readOtherBusinessRevenue(db, householdId, at)]);
  return toTaxInputs({ ...taxRows, otherBusinessRevenueVnd }, at);
}
