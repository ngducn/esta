import type { Page } from '@playwright/test';
import { formatVnd } from '../../packages/core/src/format/index.ts';
import { isoDate } from '../../packages/core/src/date/iso-date.ts';
import { vnd } from '../../packages/core/src/money/vnd.ts';
import { schedulePeriodRowSchema } from '../../packages/core/src/schemas/lease.ts';
import { ownershipShareRowSchema, TAX_LEASE_COLUMNS, taxLeaseRowSchema, toTaxInputs } from '../../packages/core/src/tax/inputs.ts';
import { computeTaxPosition, type TaxPosition } from '../../packages/core/src/tax/position.ts';
import { taxRuleRowSchema } from '../../packages/core/src/tax/rules.ts';
import { memberRest } from './auth-api';

/**
 * The position the card should show, from the rows the signed-in member reads through PostgREST and core's own
 * functions, so the expected figures never come from the web loader under test.
 */
export async function expectedTaxPosition(page: Page, owner: string, year: number, asOf: string): Promise<TaxPosition> {
  const [party] = await memberRest<{ id: string; household_id: string }[]>(page, 'GET', `parties?full_name=eq.${encodeURIComponent(owner)}&select=id,household_id`);
  if (party === undefined) throw new Error(`No party named ${owner}`);
  const leases = taxLeaseRowSchema.array().parse(await memberRest(page, 'GET', `leases?household_id=eq.${party.household_id}&status=neq.draft&select=${TAX_LEASE_COLUMNS.replaceAll(' ', '')}`));
  const schedule = schedulePeriodRowSchema
    .array()
    .parse(await memberRest(page, 'POST', 'rpc/lease_schedule', { p_lease_ids: leases.map((lease) => lease.id), p_until: `${year}-12-31` }));
  const shares = ownershipShareRowSchema.array().parse(await memberRest(page, 'GET', `ownership_shares?household_id=eq.${party.household_id}&select=property_id,party_id,share_bp`));
  const rules = taxRuleRowSchema.array().parse(await memberRest(page, 'GET', 'tax_rules?select=kind,effective_from,effective_to,params,source_citation,note'));
  const [other] = await memberRest<{ other_business_revenue_vnd: number }[]>(page, 'GET', `owner_tax_inputs?party_id=eq.${party.id}&year=eq.${year}&select=other_business_revenue_vnd`);
  const inputs = toTaxInputs({ leases, schedule, shares, rules, otherBusinessRevenueVnd: vnd(other?.other_business_revenue_vnd ?? 0) }, { partyId: party.id, year, asOf: isoDate(asOf) });
  if (inputs.kind === 'no_rule') throw new Error(`No tax rule for ${year}`);
  return computeTaxPosition(inputs);
}

/** `482.658.469 ₫` as the card prints it, for a figure the test knows as a number. */
export const cardVnd = (amount: number) => formatVnd(vnd(amount), 'vi');

/** The number in a printed amount such as `482.658.469 ₫`. */
export const printedVnd = (text: string) => Number(text.replace(/[^\d]/g, ''));
