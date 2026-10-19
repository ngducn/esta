import { addDays, addMonths } from '../date/calendar';
import { isoDate } from '../date/iso-date';
import { vnd } from '../money/vnd';
import type { BillingCycleMonths, SchedulePeriod } from './types';

/**
 * For tests: `count` back-to-back periods of `cycleMonths` from `start` at `monthlyRentVnd`, the shape `public.lease_schedule`
 * returns, with no paid-through cover or invoice.
 */
export function schedulePeriods(leaseId: string, start: string, monthlyRentVnd: number, count: number, cycleMonths: BillingCycleMonths = 1): SchedulePeriod[] {
  return Array.from({ length: count }, (_, k) => {
    const from = addMonths(isoDate(start), k * cycleMonths);
    return {
      leaseId,
      start: from,
      end: addDays(addMonths(isoDate(start), (k + 1) * cycleMonths), -1),
      dueDate: from,
      monthlyRentVnd: vnd(monthlyRentVnd),
      rentVnd: vnd(monthlyRentVnd * cycleMonths),
      coveredByPaidThrough: false,
      invoiceId: null,
    };
  });
}
