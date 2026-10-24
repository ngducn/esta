import { defineRule } from '../types';

/** The one property with the lowest completeness below the bar; ties go to the smaller id, so the pick is stable. */
export const w11LowCompleteness = defineRule({
  id: 'W11',
  scope: 'live',
  thresholds: { belowPercent: 60 },
  repeat: 'daily',
  find: ({ properties }, { belowPercent }) => {
    const [lowest] = properties
      .flatMap((property) => (property.completenessPercent !== null && property.completenessPercent < belowPercent ? [{ id: property.id, percent: property.completenessPercent }] : []))
      .toSorted((a, b) => a.percent - b.percent || a.id.localeCompare(b.id));
    return lowest === undefined ? [] : [{ subjectKey: `property:${lowest.id}`, severity: 'info', numbers: { completeness_percent: lowest.percent } }];
  },
});
