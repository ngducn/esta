import { daysBetween } from '../../date/calendar';
import { EXPIRY_WINDOW_DAYS } from '../../documents/expiry';
import { defineRule } from '../types';

/** A document that expires within the vault's countdown window; one due today still has 0 days left. */
export const w05DocumentExpiry = defineRule({
  id: 'W5',
  scope: 'live',
  thresholds: { watchWithinDays: EXPIRY_WINDOW_DAYS, actionWithinDays: 7 },
  repeat: 'daily',
  find: ({ asOf, documents }, { watchWithinDays, actionWithinDays }) =>
    documents.flatMap((document) => {
      const days = daysBetween(asOf, document.expiresOn);
      if (days < 0 || days > watchWithinDays) return [];
      return [{ subjectKey: `document:${document.id}`, severity: days <= actionWithinDays ? 'action' : 'watch', numbers: { days_until_expiry: days, expires_on: document.expiresOn } }];
    }),
});
