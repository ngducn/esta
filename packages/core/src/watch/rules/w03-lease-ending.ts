import { daysBetween } from '../../date/calendar';
import { inEffect } from '../../lease/current';
import { liveIds } from '../lookup';
import { defineRule } from '../types';

/** A lease in effect on a live property, a termination dated ahead included, that ends soon with no renewal signed. */
export const w03LeaseEnding = defineRule({
  id: 'W3',
  name: 'lease ending',
  thresholds: { watchWithinDays: 60, actionWithinDays: 30 },
  repeat: 'daily',
  find: (snapshot, { watchWithinDays, actionWithinDays }) => {
    const live = liveIds(snapshot);
    return snapshot.leases.flatMap((lease) => {
      if (lease.end_date === null || lease.renewed || !live.has(lease.propertyId) || !inEffect(lease, snapshot.asOf)) return [];
      const days = daysBetween(snapshot.asOf, lease.end_date);
      if (days > watchWithinDays) return [];
      return [{ subjectKey: `lease:${lease.id}`, severity: days <= actionWithinDays ? 'action' : 'watch', numbers: { days_until_end: days, end_date: lease.end_date } }];
    });
  },
});
