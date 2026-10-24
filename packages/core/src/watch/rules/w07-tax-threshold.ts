import { defineRule } from '../types';

/** An owner whose projected attributed revenue for the year (SPEC FIN-3) nears or reaches the threshold. */
export const w07TaxThreshold = defineRule({
  id: 'W7',
  scope: 'all',
  thresholds: { watchFromBp: 8_000, actionFromBp: 10_000 },
  repeat: 'yearly',
  find: ({ taxPositions }, { watchFromBp, actionFromBp }) =>
    taxPositions.flatMap((position) => {
      if (position.progressBp < watchFromBp) return [];
      return [
        {
          subjectKey: `owner:${position.partyId}:${position.year}`,
          severity: position.progressBp >= actionFromBp ? 'action' : 'watch',
          numbers: { year: position.year, progress_bp: position.progressBp, projected_vnd: position.projectedVnd, threshold_total_vnd: position.thresholdTotalVnd, threshold_vnd: position.thresholdVnd },
        },
      ];
    }),
});
