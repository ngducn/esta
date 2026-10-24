import { daysBetween } from '../../date/calendar';
import { defineRule } from '../types';

/** A lease that ended a while ago and still holds a deposit. */
export const w06DepositUnsettled = defineRule({
  id: 'W6',
  scope: 'all',
  thresholds: { afterDays: 14 },
  repeat: 'daily',
  find: ({ asOf, leases }, { afterDays }) =>
    leases.flatMap((lease) => {
      if (lease.end_date === null || lease.end_date >= asOf || lease.depositHeldVnd <= 0) return [];
      const days = daysBetween(lease.end_date, asOf);
      if (days <= afterDays) return [];
      return [{ subjectKey: `lease:${lease.id}`, severity: 'action', numbers: { days_since_end: days, end_date: lease.end_date, deposit_held_vnd: lease.depositHeldVnd } }];
    }),
});
