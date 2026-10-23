import { vnd, type Vnd } from '../money/vnd';
import { scaleRoundHalfUp } from '../money/round';
import type { OwnerRevenue } from './attribute';
import { activeTaxNotes, type TaxNoteKey } from './notes';
import { PIT_BASES, VAT_BASES, type TaxRule } from './rules';

export type WithheldLease = { leaseId: string; propertyId: string; accruedVnd: Vnd; projectedVnd: Vnd };

export type TaxPosition = {
  accruedVnd: Vnd;
  projectedVnd: Vnd;
  /** Projected rental revenue plus other business revenue, the figure the threshold tests. */
  thresholdTotalVnd: Vnd;
  thresholdVnd: Vnd;
  remainingToThresholdVnd: Vnd;
  /** Rounded down, so it reaches 10000 only at the threshold. */
  progressBp: number;
  overThreshold: boolean;
  /** Projected rental revenue minus the leases whose tenant withholds the tax. */
  selfDeclaredVnd: Vnd;
  withheldVnd: Vnd;
  withheldLeases: readonly WithheldLease[];
  vatEstimateVnd: Vnd;
  pitEstimateVnd: Vnd;
  noteKeys: readonly TaxNoteKey[];
  sourceCitation: string;
  ruleNote: string | null;
};

const BP_PER_UNIT = 10_000;

function applyBp(amount: Vnd, rateBp: number): Vnd {
  return scaleRoundHalfUp(amount, rateBp, BP_PER_UNIT, 1);
}

export function computeTaxPosition(input: {
  rule: TaxRule;
  attribution: OwnerRevenue;
  otherBusinessRevenueVnd: Vnd;
}): TaxPosition {
  const { rule, attribution, otherBusinessRevenueVnd } = input;
  const withheldLeases = attribution.leases
    .filter((lease) => lease.taxPayer === 'tenant_withholds')
    .map(({ leaseId, propertyId, accruedVnd, projectedVnd }) => ({ leaseId, propertyId, accruedVnd, projectedVnd }));
  const withheldVnd = vnd(withheldLeases.reduce((sum, lease) => sum + lease.projectedVnd, 0));
  const selfDeclaredVnd = vnd(attribution.projectedVnd - withheldVnd);
  const thresholdTotalVnd = vnd(attribution.projectedVnd + otherBusinessRevenueVnd);
  const thresholdVnd = rule.thresholdVnd;
  const overThreshold = thresholdTotalVnd > thresholdVnd;
  const base = { selfDeclaredVnd, thresholdVnd, overThreshold };
  return {
    accruedVnd: attribution.accruedVnd,
    projectedVnd: attribution.projectedVnd,
    thresholdTotalVnd,
    thresholdVnd,
    remainingToThresholdVnd: vnd(Math.max(0, thresholdVnd - thresholdTotalVnd)),
    progressBp: Number((BigInt(thresholdTotalVnd) * BigInt(BP_PER_UNIT)) / BigInt(thresholdVnd)),
    overThreshold,
    selfDeclaredVnd,
    withheldVnd,
    withheldLeases,
    vatEstimateVnd: applyBp(VAT_BASES[rule.vatBase](base), rule.vatRateBp),
    pitEstimateVnd: applyBp(PIT_BASES[rule.pitBase](base), rule.pitRateBp),
    noteKeys: activeTaxNotes({ rule, attribution, otherBusinessRevenueVnd }),
    sourceCitation: rule.sourceCitation,
    ruleNote: rule.note,
  };
}
