import { collectionState } from '../../collections/group';
import { defineRule } from '../types';

/** An issued invoice past its due date and not fully paid, read as the collections board reads it, so the days agree. */
export const w01Overdue = defineRule({
  id: 'W1',
  thresholds: { actionAfterDays: 7 },
  repeat: 'daily',
  find: ({ asOf, invoices }, { actionAfterDays }) =>
    invoices.flatMap((invoice) => {
      const state = collectionState(invoice, asOf);
      if (state.group !== 'overdue') return [];
      return [
        {
          subjectKey: `invoice:${invoice.id}`,
          severity: state.days > actionAfterDays ? 'action' : 'watch',
          numbers: { days_overdue: state.days, due_date: invoice.dueDate, outstanding_vnd: invoice.outstandingVnd },
        },
      ];
    }),
});
