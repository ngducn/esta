import { z } from 'zod';
import type { IsoDate } from '../date/iso-date';
import { TAX_PAYERS } from '../lease/types';
import { vnd, type Vnd } from '../money/vnd';
import type { SchedulePeriod } from '../schedule/types';
import { isoDateSchema } from '../schemas/legal';
import { attributeRevenue, periodsFromSchedule, type OwnerRevenue, type OwnershipShare, type TaxLease } from './attribute';
import { selectTaxRule, type TaxRule, type TaxRuleSet } from './rules';

export const TAX_LEASE_COLUMNS = 'id, property_id, status, terminated_on, tax_payer, declaring_party_id';

/** A non-draft `leases` row as tax reads it. Recurring charges stay empty until `lease_recurring_charges` exists. */
export const taxLeaseRowSchema = z
  .object({
    id: z.uuid(),
    property_id: z.uuid(),
    status: z.enum(['active', 'ended', 'terminated']),
    terminated_on: isoDateSchema.nullable(),
    tax_payer: z.enum(TAX_PAYERS),
    declaring_party_id: z.uuid().nullable(),
  })
  .transform(
    (row): TaxLease => ({
      id: row.id,
      propertyId: row.property_id,
      active: row.status !== 'ended',
      terminatedOn: row.terminated_on,
      taxPayer: row.tax_payer,
      declaringPartyId: row.declaring_party_id,
      recurringCharges: [],
    }),
  );

export const ownershipShareRowSchema = z
  .object({ property_id: z.uuid(), party_id: z.uuid(), share_bp: z.number().int().min(1).max(10_000) })
  .transform((row): OwnershipShare => ({ propertyId: row.property_id, partyId: row.party_id, shareBp: row.share_bp }));

export type TaxRows = {
  leases: readonly TaxLease[];
  /** `public.lease_schedule` through 31 December of the year, so an open-ended lease projects to the year's end. */
  schedule: readonly Pick<SchedulePeriod, 'leaseId' | 'start' | 'end' | 'rentVnd'>[];
  shares: readonly OwnershipShare[];
  rules: TaxRuleSet;
  otherBusinessRevenueVnd: Vnd;
};

/** What `computeTaxPosition` takes for one owner and year, or the year with no rule to apply. */
export type TaxInputs =
  | { kind: 'no_rule'; year: number }
  | { kind: 'rule'; rule: TaxRule; attribution: OwnerRevenue; otherBusinessRevenueVnd: Vnd };

/** Maps the household's rows to one owner's tax inputs. An owner with no attributed lease gets zero revenue. */
export function toTaxInputs(rows: TaxRows, { partyId, year, asOf }: { partyId: string; year: number; asOf: IsoDate }): TaxInputs {
  const selection = selectTaxRule(rows.rules, year);
  if (selection.kind === 'no_rule') return selection;
  const periods = rows.leases.flatMap((lease) =>
    periodsFromSchedule(
      rows.schedule.filter((period) => period.leaseId === lease.id),
      lease,
    ),
  );
  const attribution = attributeRevenue({ periods, shares: rows.shares, year, asOf });
  const owner = attribution.owners.find((candidate) => candidate.partyId === partyId) ?? { partyId, accruedVnd: vnd(0), projectedVnd: vnd(0), leases: [] };
  return { kind: 'rule', rule: selection.rule, attribution: owner, otherBusinessRevenueVnd: rows.otherBusinessRevenueVnd };
}
