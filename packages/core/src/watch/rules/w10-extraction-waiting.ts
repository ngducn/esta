import { daysBetween } from '../../date/calendar';
import { defineRule } from '../types';

/** A document whose reading has waited for review for more than a few days. */
export const w10ExtractionWaiting = defineRule({
  id: 'W10',
  scope: 'live',
  thresholds: { afterDays: 3 },
  repeat: 'daily',
  find: ({ asOf, extractions }, { afterDays }) =>
    extractions.flatMap((extraction) => {
      const days = daysBetween(extraction.waitingSince, asOf);
      if (days <= afterDays) return [];
      return [{ subjectKey: `document:${extraction.documentId}`, severity: 'info', numbers: { days_waiting: days, waiting_since: extraction.waitingSince } }];
    }),
});
