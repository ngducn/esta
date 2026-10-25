import { formatBps, formatVnd, formatYear } from '@esta/core/format';
import { estaUri } from '@esta/core/links';
import { computeTaxPosition, toTaxInputs } from '@esta/core/tax';
import { z } from 'zod';
import type { ReadToolContext } from './ask-reads';
import { sameAnswer } from './fact-sheet';
import { parseToolInput } from './server';

const inputSchema = z.strictObject({ year: z.number().int().min(2000).max(2100) });

/** `tax_position` (AGENT.md §4): each owner's year as the tax card computes it (FIN-3), one record per owner. */
export function taxPositionTool({ reads, locale, asOf, cite }: ReadToolContext) {
  return sameAnswer(async (raw: Record<string, unknown>) => {
    const { year } = parseToolInput(inputSchema, raw, 'tax_position takes {"year"}');
    const report = await reads.report(year);
    const owners = report.owners.flatMap((owner) => {
      const inputs = toTaxInputs({ ...report.tax, otherBusinessRevenueVnd: owner.otherBusinessRevenueVnd }, { partyId: owner.id, year, asOf });
      if (inputs.kind === 'no_rule') return [];
      const position = computeTaxPosition(inputs);
      return [
        cite({
          owner_name: owner.name,
          tax_year_display: formatYear(year),
          accrued_display: formatVnd(position.accruedVnd, locale),
          projected_display: formatVnd(position.projectedVnd, locale),
          other_business_revenue_display: formatVnd(owner.otherBusinessRevenueVnd, locale),
          threshold_display: formatVnd(position.thresholdVnd, locale),
          remaining_to_threshold_display: formatVnd(position.remainingToThresholdVnd, locale),
          threshold_share_display: formatBps(position.progressBp, locale),
          over_threshold: position.overThreshold,
          vat_estimate_display: formatVnd(position.vatEstimateVnd, locale),
          pit_estimate_display: formatVnd(position.pitEstimateVnd, locale),
          rule_source_label: position.sourceCitation,
          link: estaUri({ type: 'party', id: owner.id }),
        }),
      ];
    });
    return { owners, no_rule: owners.length === 0 && report.owners.length > 0 };
  });
}
