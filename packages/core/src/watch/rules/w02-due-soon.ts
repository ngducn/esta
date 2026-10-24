import { collectionState } from '../../collections/group';
import { daysBetween } from '../../date/calendar';
import { defineRule } from '../types';

/** An issued invoice not yet paid that falls due today or within the next few days. */
export const w02DueSoon = defineRule({
  id: 'W2',
  name: 'due soon',
  thresholds: { withinDays: 3 },
  repeat: 'daily',
  find: ({ asOf, invoices }, { withinDays }) =>
    invoices.flatMap((invoice) => {
      const group = collectionState(invoice, asOf).group;
      const days = daysBetween(asOf, invoice.dueDate);
      if ((group !== 'due' && group !== 'notDue') || days > withinDays) return [];
      return [{ subjectKey: `invoice:${invoice.id}`, severity: 'info', numbers: { days_until_due: days, due_date: invoice.dueDate, outstanding_vnd: invoice.totalVnd - invoice.allocatedVnd } }];
    }),
});
