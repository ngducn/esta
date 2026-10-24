import { daysBetween } from '../../date/calendar';
import { inEffect } from '../../lease/current';
import { defineRule } from '../types';

/** A lease in effect, a termination dated ahead included, that ends soon with no renewal signed. */
export const w03LeaseEnding = defineRule({
  id: 'W3',
  scope: 'live',
  thresholds: { watchWithinDays: 60, actionWithinDays: 30 },
  repeat: 'daily',
  find: ({ asOf, leases }, { watchWithinDays, actionWithinDays }) =>
    leases.flatMap((lease) => {
      if (lease.end_date === null || lease.renewed || !inEffect(lease, asOf)) return [];
      const days = daysBetween(asOf, lease.end_date);
      if (days > watchWithinDays) return [];
      return [{ subjectKey: `lease:${lease.id}`, severity: days <= actionWithinDays ? 'action' : 'watch', numbers: { days_until_end: days, end_date: lease.end_date } }];
    }),
});
