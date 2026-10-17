import { daysBetween } from '../date/calendar';
import type { IsoDate } from '../date/iso-date';
import { vnd, type Vnd } from '../money/vnd';
import { addDays, addMonths } from '../schedule/dates';
import type { Period } from '../schedule/types';

export type TaxPayer = 'owner' | 'tenant_withholds';

export type DateRange = { start: IsoDate; end: IsoDate };

/** Revenue a lease earns over one inclusive date range, whatever its billing cycle. */
export type RevenuePeriod = DateRange & {
  leaseId: string;
  propertyId: string;
  amountVnd: Vnd;
  taxPayer: TaxPayer;
  declaringPartyId: string | null;
  /** The contracted remainder of the year counts only for an active lease. */
  active: boolean;
};

export type OwnershipShare = { propertyId: string; partyId: string; shareBp: number };

export type RecurringCharge = { amountVnd: Vnd; cycleMonths: number };

/** The lease facts the tax position reads; drafts never reach it. */
export type TaxLease = {
  id: string;
  propertyId: string;
  active: boolean;
  terminatedOn: IsoDate | null;
  taxPayer: TaxPayer;
  declaringPartyId: string | null;
  recurringCharges: readonly RecurringCharge[];
};

export type AttributionBasis = { kind: 'declaring_party' } | { kind: 'ownership_share'; shareBp: number };

export type LeaseRevenue = {
  leaseId: string;
  propertyId: string;
  taxPayer: TaxPayer;
  basis: AttributionBasis;
  accruedVnd: Vnd;
  projectedVnd: Vnd;
};

export type OwnerRevenue = { partyId: string; accruedVnd: Vnd; projectedVnd: Vnd; leases: readonly LeaseRevenue[] };

export type RevenueAttribution = {
  year: number;
  asOf: IsoDate;
  owners: readonly OwnerRevenue[];
  unattributed: { accruedVnd: Vnd; projectedVnd: Vnd };
};

const FULL_SHARE_BP = 10_000;

/**
 * Splits `amountVnd` in proportion to `weights` with the largest remainder method, ties going to the
 * earlier weight, so the parts always sum to the amount.
 */
function largestRemainder(amountVnd: Vnd, weights: readonly number[]): Vnd[] {
  if (amountVnd < 0) throw new RangeError(`Cannot split a negative amount: ${amountVnd}`);
  const total = BigInt(weights.reduce((sum, weight) => sum + weight, 0));
  if (total <= 0n) throw new RangeError('Cannot split by weights that sum to zero');
  const amount = BigInt(amountVnd);
  const parts = weights.map((weight) => {
    const product = amount * BigInt(weight);
    return { base: product / total, remainder: product % total };
  });
  let leftover = amount - parts.reduce((sum, part) => sum + part.base, 0n);
  const byRemainder = parts.map((part, index) => ({ index, remainder: part.remainder }));
  byRemainder.sort((a, b) => (a.remainder === b.remainder ? a.index - b.index : a.remainder > b.remainder ? -1 : 1));
  const extra = new Set<number>();
  for (const { index } of byRemainder) {
    if (leftover === 0n) break;
    extra.add(index);
    leftover -= 1n;
  }
  return parts.map((part, index) => vnd(Number(part.base + (extra.has(index) ? 1n : 0n))));
}

/**
 * Splits one period's amount across the day segments that `cuts` start. A cut outside the period,
 * or on its first day, starts no segment.
 */
export function splitAmountByDays(
  amountVnd: Vnd,
  period: DateRange,
  cuts: readonly IsoDate[],
): (DateRange & { amountVnd: Vnd })[] {
  const starts = [...new Set(cuts.filter((cut) => cut > period.start && cut <= period.end))].sort();
  const ranges = [period.start, ...starts].map((start, i) => ({
    start,
    end: i < starts.length ? addDays(starts[i] as IsoDate, -1) : period.end,
  }));
  const amounts = largestRemainder(
    amountVnd,
    ranges.map((range) => daysBetween(range.start, range.end) + 1),
  );
  return ranges.map((range, i) => ({ ...range, amountVnd: amounts[i] as Vnd }));
}

type LeaseTotals = { period: RevenuePeriod; accrued: number; remainder: number };

function yearStart(year: number): IsoDate {
  return `${String(year).padStart(4, '0')}-01-01` as IsoDate;
}

function sumLeaseTotals(periods: readonly RevenuePeriod[], year: number, asOf: IsoDate): Map<string, LeaseTotals> {
  const first = yearStart(year);
  const next = yearStart(year + 1);
  const afterAsOf = addDays(asOf, 1);
  const cut = afterAsOf < first ? first : afterAsOf > next ? next : afterAsOf;
  const totals = new Map<string, LeaseTotals>();
  for (const period of periods) {
    if (period.end < first || period.start >= next) continue;
    const lease = totals.get(period.leaseId) ?? { period, accrued: 0, remainder: 0 };
    for (const segment of splitAmountByDays(period.amountVnd, period, [first, cut, next])) {
      if (segment.start < first || segment.start >= next) continue;
      if (segment.start < cut) lease.accrued += segment.amountVnd;
      else if (period.active) lease.remainder += segment.amountVnd;
    }
    totals.set(period.leaseId, lease);
  }
  return totals;
}

type Recipient = { kind: 'owner'; partyId: string; basis: AttributionBasis; weight: number } | { kind: 'unattributed'; weight: number };

function recipientsOf(period: RevenuePeriod, sharesByProperty: Map<string, OwnershipShare[]>): Recipient[] {
  if (period.declaringPartyId !== null) {
    return [{ kind: 'owner', partyId: period.declaringPartyId, basis: { kind: 'declaring_party' }, weight: FULL_SHARE_BP }];
  }
  const shares = (sharesByProperty.get(period.propertyId) ?? []).filter((share) => share.shareBp > 0);
  const owned = shares.reduce((sum, share) => sum + share.shareBp, 0);
  const recipients: Recipient[] = shares.map((share) => ({
    kind: 'owner',
    partyId: share.partyId,
    basis: { kind: 'ownership_share', shareBp: share.shareBp },
    weight: share.shareBp,
  }));
  if (owned < FULL_SHARE_BP) recipients.push({ kind: 'unattributed', weight: FULL_SHARE_BP - owned });
  return recipients;
}

/**
 * Attributes in-year revenue to owners: accrued runs from 1 January through `asOf`, and projected adds
 * the contracted remainder to 31 December for active leases. A declaring party takes the whole lease;
 * otherwise ownership shares split it, and any share below 10000 bp stays unattributed.
 */
export function attributeRevenue(input: {
  periods: readonly RevenuePeriod[];
  shares: readonly OwnershipShare[];
  year: number;
  asOf: IsoDate;
}): RevenueAttribution {
  const sharesByProperty = new Map<string, OwnershipShare[]>();
  for (const share of input.shares) {
    sharesByProperty.set(share.propertyId, [...(sharesByProperty.get(share.propertyId) ?? []), share]);
  }
  const owners = new Map<string, { accrued: number; projected: number; leases: LeaseRevenue[] }>();
  const unattributed = { accrued: 0, projected: 0 };
  for (const { period, accrued, remainder } of sumLeaseTotals(input.periods, input.year, input.asOf).values()) {
    const recipients = recipientsOf(period, sharesByProperty);
    const weights = recipients.map((recipient) => recipient.weight);
    const accruedParts = largestRemainder(vnd(accrued), weights);
    const remainderParts = largestRemainder(vnd(remainder), weights);
    recipients.forEach((recipient, i) => {
      const accruedVnd = accruedParts[i] as Vnd;
      const projectedVnd = vnd(accruedVnd + (remainderParts[i] as Vnd));
      if (recipient.kind === 'unattributed') {
        unattributed.accrued += accruedVnd;
        unattributed.projected += projectedVnd;
        return;
      }
      const owner = owners.get(recipient.partyId) ?? { accrued: 0, projected: 0, leases: [] };
      owner.accrued += accruedVnd;
      owner.projected += projectedVnd;
      owner.leases.push({
        leaseId: period.leaseId,
        propertyId: period.propertyId,
        taxPayer: period.taxPayer,
        basis: recipient.basis,
        accruedVnd,
        projectedVnd,
      });
      owners.set(recipient.partyId, owner);
    });
  }
  return {
    year: input.year,
    asOf: input.asOf,
    owners: [...owners].map(([partyId, owner]) => ({
      partyId,
      accruedVnd: vnd(owner.accrued),
      projectedVnd: vnd(owner.projected),
      leases: owner.leases,
    })),
    unattributed: { accruedVnd: vnd(unattributed.accrued), projectedVnd: vnd(unattributed.projected) },
  };
}

function clipTo(range: DateRange & { amountVnd: Vnd }, stop: IsoDate | null): (DateRange & { amountVnd: Vnd }) | null {
  if (stop === null || range.end <= stop) return range;
  if (range.start > stop) return null;
  const [kept] = splitAmountByDays(range.amountVnd, range, [addDays(stop, 1)]);
  return kept ?? null;
}

function recurringBlocks(charge: RecurringCharge, from: IsoDate, until: IsoDate): (DateRange & { amountVnd: Vnd })[] {
  if (!Number.isSafeInteger(charge.cycleMonths) || charge.cycleMonths < 1) {
    throw new RangeError(`A recurring charge cycle must be a whole number of months: ${charge.cycleMonths}`);
  }
  const blocks: (DateRange & { amountVnd: Vnd })[] = [];
  for (let i = 0; addMonths(from, i * charge.cycleMonths) <= until; i += 1) {
    const start = addMonths(from, i * charge.cycleMonths);
    const end = addDays(addMonths(from, (i + 1) * charge.cycleMonths), -1);
    const block = clipTo({ start, end, amountVnd: charge.amountVnd }, until);
    if (block !== null) blocks.push(block);
  }
  return blocks;
}

/**
 * Turns a `generateSchedule` result into revenue periods: rent for every period, paid-through ones
 * included, plus each recurring charge billed every `cycleMonths` from the lease start across the same
 * span. A termination cuts the last period by days. Metered utilities never enter.
 */
export function periodsFromSchedule(schedule: readonly Period[], lease: TaxLease): RevenuePeriod[] {
  const first = schedule[0];
  const last = schedule.at(-1);
  if (first === undefined || last === undefined) return [];
  const ranges = [
    ...schedule.map((period) => ({ start: period.start, end: period.end, amountVnd: period.rentVnd })),
    ...lease.recurringCharges.flatMap((charge) => recurringBlocks(charge, first.start, last.end)),
  ];
  return ranges.flatMap((range) => {
    const kept = clipTo(range, lease.terminatedOn);
    if (kept === null) return [];
    return [
      {
        ...kept,
        leaseId: lease.id,
        propertyId: lease.propertyId,
        taxPayer: lease.taxPayer,
        declaringPartyId: lease.declaringPartyId,
        active: lease.active,
      },
    ];
  });
}
