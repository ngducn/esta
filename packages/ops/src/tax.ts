import { isoDate, type IsoDate } from '@esta/core/date';
import { vnd } from '@esta/core/money';
import { ownershipShareRowSchema, TAX_LEASE_COLUMNS, taxLeaseRowSchema, taxRuleRowSchema, toTaxInputs, type TaxInputs } from '@esta/core/tax';
import { z } from 'zod';
import type { Db } from './db';
import { readLeaseSchedule } from './leases';

const TAX_RULE_COLUMNS = 'kind, effective_from, effective_to, params, source_citation, note';

async function rows<T>(what: string, read: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await read;
  if (error) throw new Error(`Reading ${what} failed: ${error.message}`);
  return data ?? [];
}

/** The other business revenue saved for an owner and year; no row reads as 0. */
export async function readOtherBusinessRevenue(db: Db, householdId: string, { partyId, year }: { partyId: string; year: number }) {
  const saved = await rows(
    'other business revenue',
    db.from('owner_tax_inputs').select('other_business_revenue_vnd').eq('household_id', householdId).eq('party_id', partyId).eq('year', year),
  );
  return vnd(z.number().int().nonnegative().parse(saved[0]?.other_business_revenue_vnd ?? 0));
}

/**
 * One owner's FIN-3 inputs for a year: the household's non-draft leases with their periods through 31 December,
 * ownership shares, the tax rules and the owner's other business revenue, mapped by core's `toTaxInputs`.
 */
export async function readTaxInputs(db: Db, householdId: string, at: { partyId: string; year: number; asOf: IsoDate }): Promise<TaxInputs> {
  const yearEnd = isoDate(`${at.year}-12-31`);
  const [leases, shares, rules, otherBusinessRevenueVnd] = await Promise.all([
    rows('tax leases', db.from('leases').select(TAX_LEASE_COLUMNS).eq('household_id', householdId).neq('status', 'draft').lte('start_date', yearEnd).order('id')),
    rows('ownership shares', db.from('ownership_shares').select('property_id, party_id, share_bp').eq('household_id', householdId).order('id')),
    rows('tax rules', db.from('tax_rules').select(TAX_RULE_COLUMNS)),
    readOtherBusinessRevenue(db, householdId, at),
  ]);
  const taxLeases = z.array(taxLeaseRowSchema).parse(leases);
  const schedule = await readLeaseSchedule(
    db,
    taxLeases.map((lease) => lease.id),
    yearEnd,
  );
  return toTaxInputs(
    {
      leases: taxLeases,
      schedule,
      shares: z.array(ownershipShareRowSchema).parse(shares),
      rules: z.array(taxRuleRowSchema).parse(rules),
      otherBusinessRevenueVnd,
    },
    at,
  );
}
