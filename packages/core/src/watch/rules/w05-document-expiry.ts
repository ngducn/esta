import { daysBetween } from '../../date/calendar';
import { EXPIRY_WINDOW_DAYS } from '../../documents/expiry';
import { liveIds } from '../lookup';
import { defineRule } from '../types';

/** A live document that expires within the vault's countdown window; one due today still has 0 days left. */
export const w05DocumentExpiry = defineRule({
  id: 'W5',
  thresholds: { watchWithinDays: EXPIRY_WINDOW_DAYS, actionWithinDays: 7 },
  repeat: 'daily',
  find: (snapshot, { watchWithinDays, actionWithinDays }) => {
    const live = liveIds(snapshot);
    return snapshot.documents.flatMap((document) => {
      const days = daysBetween(snapshot.asOf, document.expiresOn);
      if (days < 0 || days > watchWithinDays || (document.propertyId !== null && !live.has(document.propertyId))) return [];
      return [{ subjectKey: `document:${document.id}`, severity: days <= actionWithinDays ? 'action' : 'watch', numbers: { days_until_expiry: days, expires_on: document.expiresOn } }];
    });
  },
});
