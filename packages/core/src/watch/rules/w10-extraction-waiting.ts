import { daysBetween } from '../../date/calendar';
import { liveIds } from '../lookup';
import { defineRule } from '../types';

/** A live document whose reading has waited for review for more than a few days. */
export const w10ExtractionWaiting = defineRule({
  id: 'W10',
  name: 'extraction waiting',
  thresholds: { afterDays: 3 },
  repeat: 'daily',
  find: (snapshot, { afterDays }) => {
    const live = liveIds(snapshot);
    return snapshot.extractions.flatMap((extraction) => {
      const days = daysBetween(extraction.waitingSince, snapshot.asOf);
      if (days <= afterDays || (extraction.propertyId !== null && !live.has(extraction.propertyId))) return [];
      return [{ subjectKey: `document:${extraction.documentId}`, severity: 'info', numbers: { days_waiting: days, waiting_since: extraction.waitingSince } }];
    });
  },
});
